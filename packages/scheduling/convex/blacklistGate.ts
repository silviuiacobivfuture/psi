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
import { emailKey, phoneKey } from "../src/domain/clients";
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

/** The clients whose own phone or e-mail on file is one the candidate gave (the duplicate keys). */
async function clientsByContact(
	ctx: QueryCtx,
	tenant: string,
	candidate: BlacklistCandidate,
): Promise<ReadonlyArray<Id<"clients">>> {
	const wanted = [
		...(candidate.phones ?? []).flatMap((p) => {
			const k = p === undefined ? undefined : phoneKey(p);
			return k === undefined ? [] : [`p:${k}`];
		}),
		...(candidate.emails ?? []).flatMap((e) => {
			const k = e === undefined ? undefined : emailKey(e);
			return k === undefined ? [] : [`e:${k}`];
		}),
	];
	const found = new Set<Id<"clients">>();
	for (const key of wanted) {
		const rows = await ctx.db
			.query("clientKeys")
			.withIndex("by_tenant_key", (q) => q.eq("tenant", tenant).eq("key", key))
			.take(20);
		for (const row of rows) found.add(row.client);
	}
	return [...found];
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
	const known = {
		...candidate,
		clients: await clientsByContact(ctx, tenant, candidate),
	};
	const decision = blacklistGate("online", await hitFor(ctx, tenant, known, now));
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
