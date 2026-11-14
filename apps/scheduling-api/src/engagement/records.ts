import { accountHashOf } from "@psi/scheduling";
import { z } from "zod";
import type { KeyedPort } from "../store/ports";
import { StoreRefused } from "../store/types";

/**
 * One client's online-account invitation, as the store keeps it. No address is kept: the client's own record holds it,
 * and `emailHash` only says whether it is still the one invited. `status` is what happened; `expired` is derived from
 * `expiresAt` when the row is shown.
 */
export const InviteRow = z.object({
	v: z.literal(1),
	clientId: z.string().min(1),
	contact: z.enum(["client", "guardian"]),
	emailHash: z.string().length(64),
	sentTo: z.string().max(200),
	locale: z.enum(["ro", "en"]),
	/** The sign-in provider's id of the account (its admin API takes it). */
	ssoUserId: z.string().min(1).max(100),
	/** `accountHashOf(subject)`: the account this client's appointments are shown to. */
	accountHash: z.string().length(64),
	/** The address already had an account; no password was set by us. */
	existingAccount: z.boolean(),
	/** We created the account for this invitation, and it has never signed in. */
	createdAccount: z.boolean(),
	tokenId: z.string().min(8).max(64),
	invitedAt: z.number(),
	invitedBy: z.string().min(1).max(200),
	expiresAt: z.number(),
	lastSentAt: z.number(),
	sends: z.number().int().min(1).max(1000),
	status: z.enum(["invited", "active", "revoked"]),
	activatedAt: z.number().optional(),
	revokedAt: z.number().optional(),
});
export type InviteRow = z.infer<typeof InviteRow>;

export type InviteStatus = "invited" | "active" | "expired" | "revoked";

/** What the person sees: `invited` past its expiry is `expired`; nothing else is derived. */
export function statusOf(row: InviteRow, now: number): InviteStatus {
	if (row.status === "invited" && now >= row.expiresAt) return "expired";
	return row.status;
}

/** A stored body as JSON, or undefined when it is not (a damaged row reads as absent, never as a crash). */
export function json(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export interface Held<T> {
	row: T;
	revision: number;
}

/** How a link came to be: an invitation, a booking whose vouched e-mail was the client's, or the team's confirmation. */
export const LINK_VIA = ["invite", "match", "staff"] as const;
export type LinkVia = (typeof LINK_VIA)[number];
const Linked = z.object({ at: z.number(), via: z.enum(LINK_VIA).default("invite") });
const OfClient = z.object({ accountHash: z.string().length(64) });

/** The account side of the link: which clients a signed-in account is allowed to see, and which account a client belongs to. */
const byAccount = (hash: string, clientId: string): string => `a/${hash}/${clientId}`;
const byClient = (clientId: string): string => `c/${clientId}`;

export const hashOfSubject = accountHashOf;

/** Typed access to the invitation rows and the account links over the engagement store. */
export function invites(keyed: KeyedPort) {
	return {
		async get(app: string, clientId: string): Promise<Held<InviteRow> | undefined> {
			const held = await keyed.get(app, "invite", clientId);
			if (held === undefined) return undefined;
			const parsed = InviteRow.safeParse(json(held.body));
			return parsed.success ? { row: parsed.data, revision: held.revision } : undefined;
		},
		/** Every invitation of the app that can be read (a damaged row is left out), with its revision. */
		async all(app: string): Promise<Held<InviteRow>[]> {
			const entries = await keyed.list(app, "invite", { limit: 1000 });
			return entries.flatMap((e) => {
				const parsed = InviteRow.safeParse(json(e.body));
				return parsed.success ? [{ row: parsed.data, revision: e.revision }] : [];
			});
		},
		/** Compare-and-set from `expected` (0 creates). `StoreRefused("stale")` when someone else got there first. */
		async put(app: string, row: InviteRow, expected: number): Promise<void> {
			await keyed.put(app, "invite", row.clientId, expected, JSON.stringify(InviteRow.parse(row)));
		},
		/** Links the account to the client (and the client to the account), replacing a previous account's link. */
		async link(
			app: string,
			hash: string,
			clientId: string,
			now: number,
			via: LinkVia = "invite",
		): Promise<void> {
			const previous = await keyed.get(app, "link", byClient(clientId));
			const prior = previous === undefined ? undefined : OfClient.safeParse(json(previous.body));
			if (prior?.success === true && prior.data.accountHash !== hash)
				await keyed.remove(app, "link", byAccount(prior.data.accountHash, clientId));
			await keyed.put(
				app,
				"link",
				byClient(clientId),
				previous?.revision ?? 0,
				JSON.stringify({ accountHash: hash }),
			);
			const held = await keyed.get(app, "link", byAccount(hash, clientId));
			if (held === undefined)
				await keyed.put(
					app,
					"link",
					byAccount(hash, clientId),
					0,
					JSON.stringify({ at: now, via }),
				);
		},
		async unlink(app: string, hash: string, clientId: string): Promise<void> {
			await keyed.remove(app, "link", byAccount(hash, clientId));
			await keyed.remove(app, "link", byClient(clientId));
		},
		/** The clients an account is linked to, and how each link came to be. */
		async linksOf(app: string, hash: string): Promise<{ clientId: string; via: LinkVia }[]> {
			const entries = await keyed.list(app, "link", { prefix: `a/${hash}/`, limit: 200 });
			return entries.flatMap((e) => {
				const parsed = Linked.safeParse(json(e.body));
				return parsed.success
					? [{ clientId: e.key.slice(`a/${hash}/`.length), via: parsed.data.via }]
					: [];
			});
		},
		/** The client ids an account has been linked to; each is checked against its invitation before it shows anything. */
		async clientsOf(app: string, hash: string): Promise<string[]> {
			const entries = await keyed.list(app, "link", { prefix: `a/${hash}/`, limit: 200 });
			return entries.flatMap((e) =>
				Linked.safeParse(json(e.body)).success ? [e.key.slice(`a/${hash}/`.length)] : [],
			);
		},
	};
}

export type Invites = ReturnType<typeof invites>;

/** A store that refuses with its own reason is passed on; anything else is a bug. */
export function isStale(error: unknown): boolean {
	return error instanceof StoreRefused && error.reason === "stale";
}
