import { v } from "convex/values";
import {
	CLIENT_SORTS,
	type ClientSort,
	MAX_CLIENT_PAGE,
	nameMatches,
	needsLastVisit,
	orderPage,
} from "../src/clinic/client-page";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { owned, REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { practitionerOf } from "./setupSupport";
import { serverKeyValidator } from "./validators";

/**
 * ONE numbered page of the client list for the staff API, and how many clients match in all: the total and the page
 * come from the same read, so "1–50 din 216" and the rows always agree.
 *
 * What is read is an index range, never the table: the clinic's one standing (`by_tenant_standing_name`), or, when a
 * filter or the caller's reach names clients, only those (the practitioners' `treating` rows, the active blacklist
 * entries, the ids of the reach), each read by id. The search, the remaining filters and the order run over that
 * range (`src/clinic/client-page.ts`, the same code every store uses); a latest-visit order reads each candidate's
 * newest past visit from `visits.by_tenant_client_start`, only when that order is asked. Erased tombstones are never
 * candidates. More than MAX_CANDIDATES in the range is `too_many_rows`, never a silently partial count.
 */
const MAX_CANDIDATES = 5000;
/** A visit counts as having come when it was confirmed, not deleted, and the client was not marked absent. */
const came = (visit: Doc<"visits">): boolean =>
	visit.deletedAt === undefined && visit.status === "confirmed" && visit.attendance !== "absent";

const sortValidator = v.union(...CLIENT_SORTS.map((s) => v.literal(s)));
const standingValidator = v.union(v.literal("active"), v.literal("archived"), v.literal("deleted"));
type Standing = "active" | "archived" | "deleted";

const standingOf = (c: Doc<"clients">): Standing =>
	c.deletedAt !== undefined ? "deleted" : c.archivedAt !== undefined ? "archived" : "active";

const view = (c: Doc<"clients">) => ({ ...c, id: c._id });

/** The clinic's clients of one standing, from the standing's index range. */
async function standingRange(
	ctx: QueryCtx,
	tenant: string,
	standing: Standing,
): Promise<Doc<"clients">[]> {
	const range =
		standing === "active"
			? ctx.db
					.query("clients")
					.withIndex("by_tenant_standing_name", (q) =>
						q.eq("tenant", tenant).eq("deletedAt", undefined).eq("archivedAt", undefined),
					)
			: standing === "archived"
				? ctx.db
						.query("clients")
						.withIndex("by_tenant_standing_name", (q) =>
							q.eq("tenant", tenant).eq("deletedAt", undefined).gte("archivedAt", 0),
						)
				: ctx.db
						.query("clients")
						.withIndex("by_tenant_deleted", (q) => q.eq("tenant", tenant).gte("deletedAt", 0));
	return range.take(MAX_CANDIDATES + 1);
}

/** The clients a set of practitioners treats, from the `treating` index (each client once). */
async function treatedBy(
	ctx: QueryCtx,
	tenant: string,
	practitioners: readonly string[],
): Promise<Set<string>> {
	const out = new Set<string>();
	for (const id of new Set(practitioners)) {
		const p = await practitionerOf(ctx, tenant, id);
		if (p === undefined) continue;
		const rows = await ctx.db
			.query("treating")
			.withIndex("by_tenant_practitioner", (q) => q.eq("tenant", tenant).eq("practitioner", p._id))
			.take(MAX_CANDIDATES + 1);
		for (const r of rows) out.add(r.client);
	}
	return out;
}

/** The clients an active, unexpired blacklist entry names. */
async function listedClients(ctx: QueryCtx, tenant: string, now: number): Promise<Set<string>> {
	const rows = await ctx.db
		.query("blacklistEntries")
		.withIndex("by_tenant_active", (q) => q.eq("tenant", tenant).eq("active", true))
		.take(MAX_CANDIDATES + 1);
	return new Set(
		rows
			.filter((r) => r.client !== undefined && (r.expiresAt === undefined || r.expiresAt > now))
			.flatMap((r) => (r.client === undefined ? [] : [r.client as string])),
	);
}

/** The newest past visit of a client that counts as having come, or null. */
async function lastVisit(
	ctx: QueryCtx,
	tenant: string,
	client: Id<"clients">,
	now: number,
): Promise<number | null> {
	const newest = ctx.db
		.query("visits")
		.withIndex("by_tenant_client_start", (q) =>
			q.eq("tenant", tenant).eq("client", client).lt("start", now),
		)
		.order("desc");
	for await (const visit of newest) if (came(visit)) return visit.start;
	return null;
}

const intersect = (a: Set<string> | null, b: Set<string>): Set<string> =>
	a === null ? b : new Set([...a].filter((x) => b.has(x)));

export const page = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		standing: standingValidator,
		/** The caller's reach, when it is only some clients (a therapist's own); absent: the whole clinic. */
		within: v.optional(v.array(v.string())),
		/** Only the clients any of these practitioners treats. */
		practitioners: v.optional(v.array(v.string())),
		/** `listed`: on the blacklist now; `unassigned`: nobody treats them. */
		flag: v.optional(v.union(v.literal("listed"), v.literal("unassigned"))),
		/** `with`: holds at least one package; `without`: none. */
		packages: v.optional(v.union(v.literal("with"), v.literal("without"))),
		q: v.optional(v.string()),
		sort: sortValidator,
		offset: v.number(),
		size: v.number(),
		now: v.number(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const size = Math.floor(args.size);
		if (!(size >= 1 && size <= MAX_CLIENT_PAGE) || !(args.offset >= 0)) return REFUSED("invalid");
		if ((args.within?.length ?? 0) > MAX_CANDIDATES) return REFUSED("invalid");
		// The narrowest index first: a set of named clients when a filter or the reach names them, else the standing.
		let named: Set<string> | null = args.within === undefined ? null : new Set(args.within);
		if (args.practitioners !== undefined)
			named = intersect(named, await treatedBy(ctx, args.tenant, args.practitioners));
		if (args.flag === "listed")
			named = intersect(named, await listedClients(ctx, args.tenant, args.now));
		let rows: Doc<"clients">[];
		if (named === null) rows = await standingRange(ctx, args.tenant, args.standing);
		else {
			if (named.size > MAX_CANDIDATES) return REFUSED("too_many_rows");
			rows = [];
			for (const id of named) {
				const row = await owned(ctx, "clients", args.tenant, id);
				if (row !== null && standingOf(row) === args.standing) rows.push(row);
			}
		}
		if (rows.length > MAX_CANDIDATES) return REFUSED("too_many_rows");
		const firstTreating = async (c: Doc<"clients">) =>
			ctx.db
				.query("treating")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", c._id))
				.first();
		const firstPackage = async (c: Doc<"clients">) =>
			ctx.db
				.query("packages")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", c._id))
				.first();
		const kept: Doc<"clients">[] = [];
		for (const c of rows) {
			if (c.erasedAt !== undefined || !nameMatches(c.name, args.q ?? "")) continue;
			if (args.flag === "unassigned" && (await firstTreating(c)) !== null) continue;
			if (
				args.packages !== undefined &&
				((await firstPackage(c)) !== null) !== (args.packages === "with")
			)
				continue;
			kept.push(c);
		}
		const sort: ClientSort = args.sort;
		const visits = new Map<string, number | null>();
		if (needsLastVisit(sort))
			for (const c of kept) visits.set(c._id, await lastVisit(ctx, args.tenant, c._id, args.now));
		const cut = orderPage(
			kept.map((doc) => ({
				id: doc._id as string,
				name: doc.name,
				createdAt: doc.createdAt,
				lastVisit: visits.get(doc._id) ?? null,
				doc,
			})),
			sort,
			args.offset,
			size,
		);
		const out = [];
		for (const row of cut.rows) {
			const treating = await ctx.db
				.query("treating")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", row.doc._id))
				.take(100);
			out.push({
				client: view(row.doc),
				treating: treating.map((t) => t.practitioner as string),
				lastVisit: visits.has(row.id)
					? row.lastVisit
					: await lastVisit(ctx, args.tenant, row.doc._id, args.now),
			});
		}
		return {
			ok: true as const,
			clients: out,
			total: cut.total,
			offset: cut.offset,
		};
	},
});
