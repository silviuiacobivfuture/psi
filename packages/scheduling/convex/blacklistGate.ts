import {
	type BlacklistCandidate,
	type BlacklistEntry,
	type BlacklistHit,
	blacklistGate,
	blacklistMatch,
	MAX_ACTIVE_ENTRIES,
	type Override,
	type OverrideAuthority,
} from "../src/clinic/blacklist";
import { normalizedIdentifiers } from "../src/clinic/identifiers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { record } from "./apiSupport";

/**
 * The store side of the blacklist: load the app's active entries, ask the pure functions, and
 * write the event + audit entry when the blacklist acted. The visitor-facing paths answer one
 * neutral word (`unavailable_online`) and never see an entry; the staff paths see the hit.
 */

export const ONLINE_ACTOR = "system:online";

export function entryOf(row: Doc<"blacklistEntries">): BlacklistEntry {
	return {
		id: row._id,
		reason: row.reason,
		category: row.category,
		severity: row.severity,
		active: row.active,
		createdAt: row.createdAt,
		...(row.client === undefined ? {} : { client: row.client }),
		...(row.phone === undefined ? {} : { phone: row.phone }),
		...(row.email === undefined ? {} : { email: row.email }),
		...(row.name === undefined ? {} : { name: row.name }),
		...(row.expiresAt === undefined ? {} : { expiresAt: row.expiresAt }),
	};
}

export async function activeEntries(
	ctx: QueryCtx,
	tenant: string,
): Promise<ReadonlyArray<BlacklistEntry>> {
	const rows = await ctx.db
		.query("blacklistEntries")
		.withIndex("by_tenant_active", (q) => q.eq("tenant", tenant).eq("active", true))
		.take(MAX_ACTIVE_ENTRIES + 1);
	return rows.map(entryOf);
}

/** A client record as a candidate: their own contact and their guardian's (a child books through it). */
export function candidateOfClient(row: Doc<"clients">): BlacklistCandidate {
	return {
		clients: [row._id],
		name: row.name,
		phones: [row.phone, row.guardian?.phone],
		emails: [row.email, row.guardian?.email],
	};
}

export async function hitFor(
	ctx: QueryCtx,
	tenant: string,
	candidate: BlacklistCandidate,
	now: number,
): Promise<BlacklistHit | undefined> {
	return blacklistMatch(candidate, await activeEntries(ctx, tenant), now);
}

/**
 * The clients the candidate is, by contact: for each active entry that names a client, whether the
 * candidate's phone or e-mail is one that client has on file, their own or their guardian's (a
 * child with no contact of their own is reached through the guardian's). So an entry made on a
 * client record also turns away that client's phone and e-mail online.
 */
async function clientsByContact(
	ctx: QueryCtx,
	entries: ReadonlyArray<BlacklistEntry>,
	candidate: BlacklistCandidate,
): Promise<ReadonlyArray<string>> {
	const mine = normalizedIdentifiers(candidate);
	const found: string[] = [];
	for (const entry of entries) {
		if (entry.client === undefined) continue;
		const id = ctx.db.normalizeId("clients", entry.client);
		const row = id === null ? null : await ctx.db.get(id);
		if (row === null || row.erasedAt !== undefined) continue;
		const theirs = normalizedIdentifiers({
			phones: [row.phone, row.guardian?.phone],
			emails: [row.email, row.guardian?.email],
		});
		if (
			theirs.phones.some((p) => mine.phones.includes(p)) ||
			theirs.emails.some((e) => mine.emails.includes(e))
		) {
			found.push(entry.client);
		}
	}
	return found;
}

export type OnlineChannel = "form" | "guide" | "callback";

/**
 * An online path asks before it stores a request. A refusal is recorded (event + audit) and
 * answered with one neutral word; a warn entry or no hit lets the request through and writes nothing.
 */
export async function screenOnline(
	ctx: MutationCtx,
	tenant: string,
	candidate: BlacklistCandidate,
	channel: OnlineChannel,
	subject?: string,
): Promise<{ refused: false } | { refused: true }> {
	const now = Date.now();
	const entries = await activeEntries(ctx, tenant);
	const known = { ...candidate, clients: await clientsByContact(ctx, entries, candidate) };
	const decision = blacklistGate("online", blacklistMatch(known, entries, now));
	if (decision.outcome !== "unavailable_online") return { refused: false };
	const { entry } = decision.hit;
	await ctx.db.insert("blacklistEvents", {
		tenant,
		at: now,
		kind: "online_refused",
		entry: entry.id,
		severity: entry.severity,
		category: entry.category,
		matchedBy: decision.hit.via,
		channel,
		...(subject === undefined ? {} : { subject }),
	});
	await record(ctx, {
		tenant,
		actor: ONLINE_ACTOR,
		action: "blacklist.hit",
		entity: "blacklist",
		entityId: entry.id,
		kind: "blacklist",
		version: 0,
		fields: ["channel"],
	});
	return { refused: true };
}

/** What a staff path shows when the blacklist stops it. The reason is for staff. */
export interface StaffRefusal {
	ok: false;
	reason: "blocked" | "warning";
	blacklist: {
		entry: string;
		severity: BlacklistEntry["severity"];
		category: BlacklistEntry["category"];
		reason: string;
		matchedBy: BlacklistHit["via"];
		needs: OverrideAuthority;
	};
}

export type StaffGate =
	| { stop: StaffRefusal }
	| {
			stop?: undefined;
			overridden?: { hit: BlacklistHit; override: Override };
	  };

/** Asks the blacklist about a client a staff member is booking. Writes nothing. */
export async function staffGate(
	ctx: QueryCtx,
	tenant: string,
	client: Doc<"clients"> | null | undefined,
	override: Override | undefined,
	now: number,
): Promise<StaffGate> {
	if (client === null || client === undefined) return {};
	const hit = await hitFor(ctx, tenant, candidateOfClient(client), now);
	const decision = blacklistGate("staff", hit, override);
	if (decision.outcome === "blocked" || decision.outcome === "warning") {
		const { entry } = decision.hit;
		return {
			stop: {
				ok: false,
				reason: decision.outcome,
				blacklist: {
					entry: entry.id,
					severity: entry.severity,
					category: entry.category,
					reason: entry.reason,
					matchedBy: decision.hit.via,
					needs: decision.needs,
				},
			},
		};
	}
	return decision.outcome === "overridden"
		? { overridden: { hit: decision.hit, override: decision.override } }
		: {};
}

/** Stores the override that let a booking through: who, how strong, why, and for which visit. */
export async function recordOverride(
	ctx: MutationCtx,
	tenant: string,
	actor: string,
	used: { hit: BlacklistHit; override: Override },
	subject: Id<"visits">,
): Promise<void> {
	const { entry } = used.hit;
	await ctx.db.insert("blacklistEvents", {
		tenant,
		at: Date.now(),
		kind: "overridden",
		entry: entry.id,
		severity: entry.severity,
		category: entry.category,
		matchedBy: used.hit.via,
		channel: "staff",
		actor,
		authority: used.override.authority,
		overrideReason: used.override.reason,
		subject,
	});
	await record(ctx, {
		tenant,
		actor,
		action: "blacklist.override",
		entity: "blacklist",
		entityId: entry.id,
		kind: "blacklist",
		version: 0,
		fields: ["visit"],
	});
}
