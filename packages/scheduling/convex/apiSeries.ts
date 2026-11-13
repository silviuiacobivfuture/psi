import { v } from "convex/values";
import { MAX_SERIES } from "../src/clinic/series";
import { columnKey, visitProblems } from "../src/clinic/visits";
import { transition } from "../src/domain/lifecycle";
import { MINUTE_MS } from "../src/domain/time";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { applyEdit, editFields, planEdit } from "./apiVisitEdit";
import { recordOverride, staffGate } from "./blacklistGate";
import { requireServer } from "./guard";
import {
	actorValidator,
	creditTypeValidator,
	overrideValidator,
	serverKeyValidator,
	visitMetaValidator,
} from "./validators";
import { busyOfVisitsInfo } from "./visitConflicts";
import { columnArg, links, resolveColumn } from "./visitLinks";

/**
 * Weekly series of staff visits: made, edited and cancelled as a whole, ALL OR NOTHING. A Convex mutation that returns
 * after a write has still committed it, so each one here reads and decides everything first and writes only when every
 * occurrence passed; a refusal lists every occurrence that failed (`conflicts`, by position) and writes nothing. A
 * series is named by the id of its first visit and is a field of the visit, so one query lists its members.
 */
const occurrenceArg = v.object({ start: v.number(), end: v.number() });

/** An occurrence that cannot be had, by its position in the series. */
interface Conflict {
	index: number;
	start: number;
	reason: string;
	/** What it clashes with: the person, the room or the device. */
	with?: "practitioner" | "room" | "device";
}
const refusedWith = (reason: string, conflicts: readonly Conflict[]) => ({
	...REFUSED(reason),
	conflicts,
});

export const create = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		column: columnArg,
		occurrences: v.array(occurrenceArg),
		client: v.optional(v.string()),
		room: v.optional(v.string()),
		device: v.optional(v.string()),
		package: v.optional(v.string()),
		creditType: v.optional(creditTypeValidator),
		sessionType: v.string(),
		notes: v.optional(v.string()),
		priceMinor: v.optional(v.number()),
		status: v.optional(v.union(v.literal("requested"), v.literal("confirmed"))),
		meta: v.optional(visitMetaValidator),
		override: v.optional(overrideValidator),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.occurrences.length < 2) return REFUSED("invalid");
		if (args.occurrences.length > MAX_SERIES) return REFUSED("too_many");
		const column = await resolveColumn(ctx, args.tenant, args.column);
		if (column === null) return REFUSED("unknown_column");
		const linked = await links(ctx, args.tenant, args);
		if (!linked.ok) return REFUSED(linked.reason);
		const problems: Conflict[] = [];
		args.occurrences.forEach((o, index) => {
			const durationMinutes = Math.round((o.end - o.start) / MINUTE_MS);
			const found = visitProblems({
				column,
				...(linked.client === undefined ? {} : { client: linked.client }),
				start: o.start,
				end: o.end,
				durationMinutes,
				...(args.priceMinor === undefined ? {} : { priceMinor: args.priceMinor }),
				...(linked.package === undefined ? {} : { package: linked.package }),
				...(args.creditType === undefined ? {} : { creditType: args.creditType }),
			});
			if (found.length > 0) problems.push({ index, start: o.start, reason: found[0] ?? "invalid" });
		});
		if (problems.length > 0) return refusedWith("invalid", problems);
		// The blacklist is about the client, so it is asked once, not once an occurrence.
		const gate = await staffGate(
			ctx,
			args.tenant,
			linked.client === undefined ? undefined : await ctx.db.get(linked.client),
			args.override,
			Date.now(),
		);
		if (gate.stop !== undefined) return gate.stop;
		const clashes: Conflict[] = [];
		for (const [index, o] of args.occurrences.entries()) {
			const taken = await busyOfVisitsInfo(ctx, args.tenant, {
				column,
				room: linked.room,
				device: linked.device,
				start: o.start,
				end: o.end,
			});
			if (taken !== undefined)
				clashes.push({ index, start: o.start, reason: "overlaps", with: taken });
		}
		if (clashes.length > 0) return refusedWith("conflicts", clashes);

		const now = Date.now();
		const ids: Id<"visits">[] = [];
		for (const o of args.occurrences) {
			const id = await ctx.db.insert("visits", {
				tenant: args.tenant,
				client: linked.client,
				column,
				columnKey: columnKey(column),
				room: linked.room,
				device: linked.device,
				package: linked.package,
				creditType: args.creditType,
				start: o.start,
				end: o.end,
				durationMinutes: Math.round((o.end - o.start) / MINUTE_MS),
				sessionType: args.sessionType,
				status: args.status ?? "confirmed",
				attendance: "pending",
				notes: args.notes,
				priceMinor: args.priceMinor,
				reminderSent: false,
				clientConfirmed: false,
				createdBy: args.actor.subject,
				createdAt: now,
				updatedAt: now,
				version: 1,
				...(args.meta === undefined ? {} : { meta: args.meta }),
			});
			ids.push(id);
		}
		const series: string = ids[0] ?? "";
		for (const id of ids) {
			await ctx.db.patch(id, { series });
			await record(ctx, {
				tenant: args.tenant,
				actor: args.actor.subject,
				action: "visit.create",
				entity: "visit",
				entityId: id,
				kind: "visit",
				version: 1,
			});
		}
		if (gate.overridden !== undefined && ids[0] !== undefined)
			await recordOverride(ctx, args.tenant, args.actor.subject, gate.overridden, ids[0]);
		return { ok: true as const, series, ids };
	},
});

/** One occurrence's edit: the visit, and what changes on it (the same fields as one visit's edit). */
const itemArg = v.object({ visit: v.string(), ...editFields });

export const editMany = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		items: v.array(itemArg),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.items.length === 0 || args.items.length > MAX_SERIES) return REFUSED("invalid");
		const planned = [];
		const failed: Conflict[] = [];
		let stop: { ok: false; reason: string } | undefined;
		for (const [index, { visit, ...spec }] of args.items.entries()) {
			const row = await owned(ctx, "visits", args.tenant, visit);
			if (row === null) {
				failed.push({ index, start: 0, reason: "not_found" });
				continue;
			}
			const plan = await planEdit(ctx, args.tenant, row, spec);
			if (!plan.ok) {
				// A blacklist stop is about the client and the same for every occurrence: it is the answer, whole.
				if ("blacklist" in plan.refusal) stop = plan.refusal;
				failed.push({
					index,
					start: row.start,
					reason: plan.refusal.reason,
					...(plan.refusal.with === undefined ? {} : { with: plan.refusal.with }),
				});
			} else planned.push({ row, plan });
		}
		if (stop !== undefined) return stop;
		if (failed.length > 0) return refusedWith("conflicts", failed);
		let changed = 0;
		for (const { row, plan } of planned) {
			if (!plan.changed) continue;
			await applyEdit(ctx, args.tenant, args.actor.subject, row, plan);
			changed += 1;
		}
		return { ok: true as const, changed };
	},
});

export const cancelMany = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		/** Each visit, with the API's facts as they are once it is cancelled (they carry the reason). */
		items: v.array(v.object({ visit: v.string(), meta: v.optional(visitMetaValidator) })),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.items.length === 0 || args.items.length > MAX_SERIES) return REFUSED("invalid");
		const rows: { row: Doc<"visits">; meta: Doc<"visits">["meta"] }[] = [];
		const failed: Conflict[] = [];
		for (const [index, item] of args.items.entries()) {
			const row = await owned(ctx, "visits", args.tenant, item.visit);
			if (row === null || row.deletedAt !== undefined) {
				failed.push({ index, start: row?.start ?? 0, reason: "not_found" });
				continue;
			}
			const next = transition({ status: row.status }, { type: "cancel" }, Date.now());
			if (!next.ok) failed.push({ index, start: row.start, reason: next.reason });
			else rows.push({ row, meta: item.meta ?? row.meta });
		}
		if (failed.length > 0) return refusedWith("conflicts", failed);
		for (const { row, meta } of rows) {
			const version = row.version + 1;
			await ctx.db.patch(row._id, {
				status: "cancelled",
				...(meta === undefined ? {} : { meta }),
				updatedAt: Date.now(),
				version,
			});
			await record(ctx, {
				tenant: args.tenant,
				actor: args.actor.subject,
				action: "visit.cancel",
				entity: "visit",
				entityId: row._id,
				kind: "visit",
				version,
				fields: ["status"],
			});
		}
		return { ok: true as const, cancelled: rows.length };
	},
});

/** The visits of one series, soft-deleted ones included (they say so), in time order. */
export const visits = query({
	args: { key: serverKeyValidator, tenant: v.string(), series: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("visits")
			.withIndex("by_tenant_series_start", (q) =>
				q.eq("tenant", args.tenant).eq("series", args.series),
			)
			.take(MAX_SERIES + 1);
		return {
			ok: true as const,
			visits: rows.slice(0, MAX_SERIES).map((x) => ({ ...x, id: x._id })),
		};
	},
});
