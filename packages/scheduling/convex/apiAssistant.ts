import { v } from "convex/values";
import { makeAuditEvent } from "../src/clinic/audit";
import { mutation, query } from "./_generated/server";
import { MAX_DOCUMENT_CHARS } from "./apiDocuments";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/** The tenant the estate's own documents are kept under: no app slug can be `*`. */
const ESTATE = "*";
const platformKind = v.literal("assistant_platform");
const surface = v.union(v.literal("staff"), v.literal("visitor"));
const key = v.object({ surface, period: v.string(), scope: v.string() });
const counts = v.object({
	messages: v.number(),
	inputTokens: v.number(),
	outputTokens: v.number(),
	cachedTokens: v.number(),
	costMicroUsd: v.number(),
	limitHits: v.number(),
});
/** One turn's use never comes near this; a delta past it is a fault, not usage. */
const MAX_DELTA = 50_000_000;
const MAX_KEYS = 8;

export const getPlatform = query({
	args: { key: serverKeyValidator, kind: platformKind },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db
			.query("appDocuments")
			.withIndex("by_tenant_kind", (q) => q.eq("tenant", ESTATE).eq("kind", args.kind))
			.unique();
		return row === null
			? { ok: true as const, found: false as const }
			: {
					ok: true as const,
					found: true as const,
					revision: row.revision,
					body: row.body,
					updatedAt: row.updatedAt,
					updatedBy: row.updatedBy,
				};
	},
});

/** The estate's document edited from `expected`, compared and written in one transaction (the service audits it). */
export const putPlatform = mutation({
	args: {
		key: serverKeyValidator,
		actor: actorValidator,
		kind: platformKind,
		expected: v.number(),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (
			args.body.length > MAX_DOCUMENT_CHARS ||
			!Number.isInteger(args.expected) ||
			args.expected < 0
		)
			return REFUSED("invalid");
		const row = await ctx.db
			.query("appDocuments")
			.withIndex("by_tenant_kind", (q) => q.eq("tenant", ESTATE).eq("kind", args.kind))
			.unique();
		if ((row?.revision ?? 0) !== args.expected) return REFUSED("stale");
		const revision = args.expected + 1;
		const now = Date.now();
		const fields = { revision, body: args.body, updatedAt: now, updatedBy: args.actor.subject };
		if (row === null)
			await ctx.db.insert("appDocuments", { tenant: ESTATE, kind: args.kind, ...fields });
		else await ctx.db.patch(row._id, fields);
		// The estate's own journal entry (no app holds it): the service's `assistant.platform.put`, recorded here.
		const made = makeAuditEvent({
			tenant: ESTATE,
			at: now,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "app",
			entityId: "assistant-platform",
			fields: ["api.assistant.platform.put", `revision.${revision}`],
		});
		if (!made.ok) throw new Error(`audit event refused: ${made.problems.join(",")}`);
		const event = made.event;
		await ctx.db.insert("auditEvents", {
			tenant: event.tenant,
			at: event.at,
			actor: event.actor,
			action: event.action,
			entity: event.entity,
			entityId: event.entityId,
			summary: event.summary,
		});
		return { ok: true as const, revision, updatedAt: now };
	},
});

/** Adds one turn's use to each meter named, in one transaction; counts only grow. */
export const addUsage = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), keys: v.array(key), delta: counts },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const values = Object.values(args.delta);
		if (
			args.keys.length > MAX_KEYS ||
			values.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_DELTA)
		)
			return REFUSED("invalid");
		const tenant = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.tenant))
			.unique();
		if (tenant === null) return REFUSED("not_found");
		for (const k of args.keys) {
			const row = await ctx.db
				.query("assistantUsage")
				.withIndex("by_key", (q) =>
					q
						.eq("tenant", args.tenant)
						.eq("surface", k.surface)
						.eq("period", k.period)
						.eq("scope", k.scope),
				)
				.unique();
			const d = args.delta;
			if (row === null) await ctx.db.insert("assistantUsage", { tenant: args.tenant, ...k, ...d });
			else
				await ctx.db.patch(row._id, {
					messages: row.messages + d.messages,
					inputTokens: row.inputTokens + d.inputTokens,
					outputTokens: row.outputTokens + d.outputTokens,
					cachedTokens: row.cachedTokens + d.cachedTokens,
					costMicroUsd: row.costMicroUsd + d.costMicroUsd,
					limitHits: row.limitHits + d.limitHits,
				});
		}
		return { ok: true as const };
	},
});

export const readUsage = query({
	args: { key: serverKeyValidator, tenant: v.string(), keys: v.array(key) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.keys.length > MAX_KEYS) return REFUSED("invalid");
		const out = [];
		for (const k of args.keys) {
			const row = await ctx.db
				.query("assistantUsage")
				.withIndex("by_key", (q) =>
					q
						.eq("tenant", args.tenant)
						.eq("surface", k.surface)
						.eq("period", k.period)
						.eq("scope", k.scope),
				)
				.unique();
			out.push({
				messages: row?.messages ?? 0,
				inputTokens: row?.inputTokens ?? 0,
				outputTokens: row?.outputTokens ?? 0,
				cachedTokens: row?.cachedTokens ?? 0,
				costMicroUsd: row?.costMicroUsd ?? 0,
				limitHits: row?.limitHits ?? 0,
			});
		}
		return { ok: true as const, counts: out };
	},
});
