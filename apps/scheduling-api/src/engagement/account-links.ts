import { normalizeEmail, normalizePhone } from "@psi/scheduling/clinic";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { z } from "zod";
import { reaches } from "../authz/access";
import { writeAudit } from "../http/audit";
import type { Ctx } from "../http/context";
import { fail } from "../http/errors";
import type { ClientRow } from "../store/types";
import { clientsOfAccount } from "./invite-flow";
import { hashOfSubject, invites, json } from "./records";

type C = Ctx<RouteSpec>;

/**
 * A booking by a signed-in account whose contact is a clinic client's: the clients it could be, waiting for the team to
 * say which (or none). No address is copied here: the clients' own records hold them, and the team reads them there.
 */
const Suggestion = z.object({
	v: z.literal(1),
	candidates: z.array(z.string().min(1)).min(1).max(20),
	via: z.enum(["email", "phone"]),
	/** The request that showed the match, for the team to compare with. */
	reference: z.string().max(40).optional(),
	at: z.number(),
});
type Suggestion = z.infer<typeof Suggestion>;
const Dismissed = z.object({ at: z.number() });
const OfClient = z.object({ accountHash: z.string().length(64) });

const suggestionKey = (hash: string): string => `s/${hash}`;
const dismissedKey = (hash: string, clientId: string): string => `x/${hash}/${clientId}`;
const SUGGESTED = "s/";

/** What a booking showed about the person behind an account. `verifiedEmail`: the sign-in vouches for it. */
export interface Seen {
	emails: ReadonlyArray<string | undefined>;
	phones: ReadonlyArray<string | undefined>;
	verifiedEmail?: string | undefined;
	reference?: string | undefined;
}

export type MatchOutcome = "linked" | "suggested" | "none";

const defined = (xs: ReadonlyArray<string | undefined>, norm: (s: string) => string | undefined) =>
	new Set(xs.flatMap((x) => (x === undefined ? [] : [norm(x)])).filter((x) => x !== undefined));

function contactsOf(row: ClientRow) {
	return {
		emails: defined([row.contact?.email, row.guardian?.email], normalizeEmail),
		phones: defined([row.contact?.phone, row.guardian?.phone], normalizePhone),
	};
}

/** Which account a client is linked to, when any. */
async function accountOf(ctx: C, clientId: string): Promise<string | undefined> {
	const held = await ctx.deps.store.keyed.get(ctx.app, "link", `c/${clientId}`);
	const parsed = held === undefined ? undefined : OfClient.safeParse(json(held.body));
	return parsed?.success === true ? parsed.data.accountHash : undefined;
}

/**
 * A signed-in account booked with this contact. A client whose own or guardian's e-mail or phone is the same, and who is
 * linked to no account yet, is a match. ONE match by an e-mail the sign-in vouches for is linked at once (the account
 * then sees the clinic's sessions, and the clinic's notices reach its devices); anything less certain (several clients,
 * a phone, an address the account typed) waits for the team as a suggestion. A pair the team turned down is never
 * suggested again. Writes nothing when nothing matches.
 */
export async function matchAccount(ctx: C, subject: string, seen: Seen): Promise<MatchOutcome> {
	const emails = defined(seen.emails, normalizeEmail);
	const phones = defined(seen.phones, normalizePhone);
	if (emails.size === 0 && phones.size === 0) return "none";
	const hash = hashOfSubject(subject);
	const { keyed } = ctx.deps.store;
	const byEmail: string[] = [];
	const byPhone: string[] = [];
	for (const row of await ctx.deps.store.c.clients.list(ctx.app, { eq: { status: "active" } })) {
		const own = contactsOf(row);
		if ([...own.emails].some((e) => emails.has(e))) byEmail.push(row.id);
		else if ([...own.phones].some((p) => phones.has(p))) byPhone.push(row.id);
	}
	const open: string[] = [];
	for (const id of [...byEmail, ...byPhone]) {
		const linked = await accountOf(ctx, id);
		// Already this account's: nothing to find.
		if (linked === hash) return "none";
		if (linked !== undefined) continue;
		if ((await keyed.get(ctx.app, "link", dismissedKey(hash, id))) !== undefined) continue;
		open.push(id);
	}
	if (open.length === 0) return "none";
	const vouched = seen.verifiedEmail === undefined ? undefined : normalizeEmail(seen.verifiedEmail);
	const only = open.length === 1 ? open[0] : undefined;
	if (only !== undefined && vouched !== undefined && byEmail.includes(only)) {
		const row = await ctx.deps.store.c.clients.get(ctx.app, only);
		if (row !== undefined && contactsOf(row).emails.has(vouched)) {
			await invites(keyed).link(ctx.app, hash, only, ctx.now, "match");
			await writeAudit(ctx.deps, {
				app: ctx.app,
				actor: {
					subject: ctx.subject,
					kind: ctx.principal.kind === "person" ? "person" : "service",
				},
				action: "client.account_link",
				target: { type: "client", id: only },
				detail: { via: "email", by: "match" },
			});
			return "linked";
		}
	}
	const next: Suggestion = {
		v: 1,
		candidates: open.slice(0, 20),
		via: open.some((id) => byEmail.includes(id)) ? "email" : "phone",
		...(seen.reference === undefined ? {} : { reference: seen.reference }),
		at: ctx.now,
	};
	const held = await keyed.get(ctx.app, "link", suggestionKey(hash));
	const was = held === undefined ? undefined : Suggestion.safeParse(json(held.body));
	if (
		was?.success === true &&
		JSON.stringify(was.data.candidates) === JSON.stringify(next.candidates)
	)
		return "suggested";
	await keyed.put(ctx.app, "link", suggestionKey(hash), held?.revision ?? 0, JSON.stringify(next));
	return "suggested";
}

/** The suggestions waiting for the team, each with the candidates the caller may invite (none: not shown at all). */
export async function suggestions(ctx: C) {
	const out: {
		id: string;
		via: "email" | "phone";
		reference?: string;
		at: number;
		candidates: { clientId: string; name: string }[];
	}[] = [];
	for (const entry of await ctx.deps.store.keyed.list(ctx.app, "link", {
		prefix: SUGGESTED,
		limit: 1000,
	})) {
		const parsed = Suggestion.safeParse(json(entry.body));
		if (!parsed.success) continue;
		const candidates: { clientId: string; name: string }[] = [];
		for (const id of parsed.data.candidates) {
			if (!reaches(ctx.reach, id)) continue;
			const row = await ctx.deps.store.c.clients.get(ctx.app, id);
			if (row !== undefined) candidates.push({ clientId: id, name: row.name });
		}
		if (candidates.length === 0) continue;
		out.push({
			id: entry.key.slice(SUGGESTED.length),
			via: parsed.data.via,
			...(parsed.data.reference === undefined ? {} : { reference: parsed.data.reference }),
			at: parsed.data.at,
			candidates,
		});
	}
	return out.sort((a, b) => b.at - a.at);
}

async function held(ctx: C, hash: string) {
	const entry = await ctx.deps.store.keyed.get(ctx.app, "link", suggestionKey(hash));
	const parsed = entry === undefined ? undefined : Suggestion.safeParse(json(entry.body));
	if (entry === undefined || parsed?.success !== true) throw fail("not_found", "not found");
	return parsed.data;
}

/**
 * The team says which client the account is: linked (the account sees the clinic's sessions of that client, and its
 * notices reach the account), the suggestion gone. 404 when there is no such suggestion or the client is not one of
 * its candidates; 409 `linked_elsewhere` when another account took the client meanwhile. Nothing is written then.
 */
export async function confirmSuggestion(ctx: C, hash: string, clientId: string): Promise<void> {
	const s = await held(ctx, hash);
	if (!s.candidates.includes(clientId)) throw fail("not_found", "not found");
	const linked = await accountOf(ctx, clientId);
	if (linked !== undefined && linked !== hash)
		throw fail("conflict", "the client is linked to another account", {
			reason: "linked_elsewhere",
		});
	await invites(ctx.deps.store.keyed).link(ctx.app, hash, clientId, ctx.now, "staff");
	await ctx.deps.store.keyed.remove(ctx.app, "link", suggestionKey(hash));
	ctx.auditTarget(clientId);
	ctx.note({ via: s.via, by: "staff" });
}

/**
 * The team says the account is none of them: the suggestion goes, and none of these pairs is suggested again. The
 * caller must be able to invite at least one of its candidates (404 otherwise, as for anything they cannot reach).
 */
export async function dismissSuggestion(ctx: C, hash: string): Promise<void> {
	const s = await held(ctx, hash);
	const allowed = [];
	for (const id of s.candidates)
		if (await ctx.canOn("clients_invite", "sched_client", id)) allowed.push(id);
	const first = allowed[0] ?? s.candidates[0] ?? "";
	await ctx.authorize("clients_invite", "sched_client", first);
	for (const id of s.candidates)
		await ctx.deps.store.keyed.put(
			ctx.app,
			"link",
			dismissedKey(hash, id),
			(await ctx.deps.store.keyed.get(ctx.app, "link", dismissedKey(hash, id)))?.revision ?? 0,
			JSON.stringify(Dismissed.parse({ at: ctx.now })),
		);
	await ctx.deps.store.keyed.remove(ctx.app, "link", suggestionKey(hash));
	ctx.auditTarget(first);
	ctx.note({ candidates: s.candidates.length });
}

/**
 * Every client an account covers: invited (and not withdrawn), or linked by a match or by the team. Their sessions show
 * in the account's "Programările mele".
 */
export async function accountClients(ctx: C, subject: string): Promise<string[]> {
	const hash = hashOfSubject(subject);
	const invited = (await clientsOfAccount(ctx, subject)).map((r) => r.clientId);
	const matched = (await invites(ctx.deps.store.keyed).linksOf(ctx.app, hash))
		.filter((l) => l.via === "match" || l.via === "staff")
		.map((l) => l.clientId);
	return [...new Set([...invited, ...matched])];
}
