import { v } from "convex/values";
import { makeAuditEvent } from "../src/clinic/audit";
import { mutation, query } from "./_generated/server";
import { MAX_DOCUMENT_CHARS } from "./apiDocuments";
import { REFUSED } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/** The tenant the estate's own documents are kept under: no app slug can be `*`. */
const ESTATE = "*";
/**
 * Which estate a call reads or writes: the estate (`*`) unless a throwaway one is named, `*test-…` (a test world's own,
 * so a run against a real backend never touches the estate's document; `seed:dropFixture` removes it). No app slug
 * starts with `*`, so neither can be an app's.
 */
const estateArg = v.optional(v.string());
const THROWAWAY_ESTATE = /^\*test-[a-z0-9-]{1,60}$/;
function estateOf(asked: string | undefined): string | undefined {
	if (asked === undefined) return ESTATE;
	return THROWAWAY_ESTATE.test(asked) ? asked : undefined;
}
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
	args: { key: serverKeyValidator, kind: platformKind, estate: estateArg },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const estate = estateOf(args.estate);
		if (estate === undefined) return REFUSED("invalid");
		const row = await ctx.db
			.query("appDocuments")
			.withIndex("by_tenant_kind", (q) => q.eq("tenant", estate).eq("kind", args.kind))
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
		estate: estateArg,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const estate = estateOf(args.estate);
		if (
			estate === undefined ||
			args.body.length > MAX_DOCUMENT_CHARS ||
			!Number.isInteger(args.expected) ||
			args.expected < 0
		)
			return REFUSED("invalid");
		const row = await ctx.db
			.query("appDocuments")
			.withIndex("by_tenant_kind", (q) => q.eq("tenant", estate).eq("kind", args.kind))
			.unique();
		if ((row?.revision ?? 0) !== args.expected) return REFUSED("stale");
		const revision = args.expected + 1;
		const now = Date.now();
		const fields = { revision, body: args.body, updatedAt: now, updatedBy: args.actor.subject };
		if (row === null)
			await ctx.db.insert("appDocuments", { tenant: estate, kind: args.kind, ...fields });
		else await ctx.db.patch(row._id, fields);
		// The estate's own journal entry (no app holds it): the service's `assistant.platform.put`, recorded here.
		const made = makeAuditEvent({
			tenant: estate,
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

/** The month and the day of `now` in `timeZone` (the meters' periods), as the scheduling service computes them. */
function periodsOf(now: number, timeZone: string): { month: string; day: string } {
	const day = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	return { month: day.slice(0, 7), day };
}

const ZERO = {
	messages: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHits: 0,
};

/**
 * What a public site's assistant needs before a visitor's turn, in one read: the estate's document and the app's
 * (their bodies as stored; the site merges them), and the app's visitor meters for this month and today in its zone.
 * An app that is not there, or is switched off, is `not_found`.
 */
export const visitorConfig = query({
	args: { key: serverKeyValidator, tenant: v.string(), now: v.number(), estate: estateArg },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const estate = estateOf(args.estate);
		if (estate === undefined) return REFUSED("invalid");
		const tenant = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.tenant))
			.unique();
		if (tenant === null || !tenant.active) return REFUSED("not_found");
		const doc = async (owner: string, kind: "assistant_platform" | "assistant_config") => {
			const row = await ctx.db
				.query("appDocuments")
				.withIndex("by_tenant_kind", (q) => q.eq("tenant", owner).eq("kind", kind))
				.unique();
			return row === null ? null : { revision: row.revision, body: row.body };
		};
		const { month, day } = periodsOf(args.now, tenant.timeZone);
		const meter = async (period: string) => {
			const row = await ctx.db
				.query("assistantUsage")
				.withIndex("by_key", (q) =>
					q
						.eq("tenant", args.tenant)
						.eq("surface", "visitor")
						.eq("period", period)
						.eq("scope", "org"),
				)
				.unique();
			return row === null
				? ZERO
				: {
						messages: row.messages,
						inputTokens: row.inputTokens,
						outputTokens: row.outputTokens,
						cachedTokens: row.cachedTokens,
						costMicroUsd: row.costMicroUsd,
						limitHits: row.limitHits,
					};
		};
		return {
			ok: true as const,
			timeZone: tenant.timeZone,
			period: { month, day },
			platform: await doc(estate, "assistant_platform"),
			org: await doc(args.tenant, "assistant_config"),
			usage: { month: await meter(month), day: await meter(day) },
		};
	},
});

/** Adds one visitor turn's use to the app's visitor meters for the month and the day of `now`, in its zone. */
export const addVisitorUsage = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), now: v.number(), delta: counts },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const values = Object.values(args.delta);
		if (values.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_DELTA))
			return REFUSED("invalid");
		const tenant = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.tenant))
			.unique();
		if (tenant === null) return REFUSED("not_found");
		const { month, day } = periodsOf(args.now, tenant.timeZone);
		const d = args.delta;
		for (const period of [month, day]) {
			const row = await ctx.db
				.query("assistantUsage")
				.withIndex("by_key", (q) =>
					q
						.eq("tenant", args.tenant)
						.eq("surface", "visitor")
						.eq("period", period)
						.eq("scope", "org"),
				)
				.unique();
			if (row === null)
				await ctx.db.insert("assistantUsage", {
					tenant: args.tenant,
					surface: "visitor",
					period,
					scope: "org",
					...d,
				});
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
		return { ok: true as const, period: { month, day } };
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
