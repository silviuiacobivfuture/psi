import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { contactProblem } from "../src/domain/contact";
import { callbackRetentionAction } from "../src/domain/retention";
import { internalMutation, mutation, query } from "./_generated/server";
import { tenantBySlug } from "./calendar";
import {
	callbackChannelValidator,
	callbackStatusValidator,
	callbackWhenValidator,
} from "./callbackSchema";
import { requireServer } from "./guard";
import {
	actorValidator,
	audienceValidator,
	contactValidator,
	localeValidator,
	serverKeyValidator,
} from "./validators";

/**
 * Web callback requests (docs/plans/clinic.md slice 0). `create` is the visitor-facing server's;
 * `list` and `markHandled` are the team's console's. Every function demands the server key.
 */

const LIST_MAX = 200;
const PAGE_MAX = 120;

export const create = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		contact: contactValidator,
		audience: audienceValidator,
		when: callbackWhenValidator,
		preferredStart: v.optional(v.number()),
		service: v.optional(v.string()),
		locale: localeValidator,
		channel: callbackChannelValidator,
		page: v.string(),
		consent: v.boolean(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!args.consent) return { ok: false as const, reason: "no_consent" as const };
		if (contactProblem(args.contact) !== undefined || args.page.length > PAGE_MAX) {
			return { ok: false as const, reason: "invalid" as const };
		}
		if ((await tenantBySlug(ctx, args.tenant)) === undefined) {
			return { ok: false as const, reason: "unknown_tenant" as const };
		}
		const id = await ctx.db.insert("callbackRequests", {
			tenant: args.tenant,
			contact: args.contact,
			audience: args.audience,
			when: args.when,
			...(args.preferredStart === undefined ? {} : { preferredStart: args.preferredStart }),
			...(args.service === undefined ? {} : { service: args.service }),
			locale: args.locale,
			channel: args.channel,
			page: args.page,
			consent: true,
			status: "new",
			createdAt: Date.now(),
		});
		return { ok: true as const, id };
	},
});

/** A tenant's callback requests, newest first; staff only (the contact is included). */
export const list = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		status: v.optional(callbackStatusValidator),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const tenant = await tenantBySlug(ctx, args.tenant);
		if (tenant === undefined) return { ok: false as const, reason: "unknown_tenant" as const };
		const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 100), LIST_MAX));
		const { status } = args;
		const rows =
			status === undefined
				? await ctx.db
						.query("callbackRequests")
						.withIndex("by_tenant_created", (q) => q.eq("tenant", tenant.slug))
						.order("desc")
						.take(limit)
				: await ctx.db
						.query("callbackRequests")
						.withIndex("by_tenant_status_created", (q) =>
							q.eq("tenant", tenant.slug).eq("status", status),
						)
						.order("desc")
						.take(limit);
		return {
			ok: true as const,
			timeZone: tenant.timeZone,
			callbacks: rows.map((row) => ({
				id: row._id,
				status: row.status,
				createdAt: row.createdAt,
				audience: row.audience,
				when: row.when,
				locale: row.locale,
				channel: row.channel,
				page: row.page,
				...(row.contact === undefined ? {} : { contact: row.contact }),
				...(row.preferredStart === undefined ? {} : { preferredStart: row.preferredStart }),
				...(row.service === undefined ? {} : { service: row.service }),
				...(row.handledAt === undefined ? {} : { handledAt: row.handledAt }),
				...(row.handledBy === undefined ? {} : { handledBy: row.handledBy }),
			})),
		};
	},
});

/** The team called back: marks it handled (again is a no-op that keeps who and when). */
export const markHandled = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		id: v.id("callbackRequests"),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await ctx.db.get(args.id);
		if (row === null || row.tenant !== args.tenant) {
			return { ok: false as const, reason: "not_found" as const };
		}
		if (row.status === "handled") return { ok: true as const };
		await ctx.db.patch(row._id, {
			status: "handled",
			handledAt: Date.now(),
			handledBy: args.actor.subject,
		});
		return { ok: true as const };
	},
});

/** Applies the retention policy to one page of callback requests; returns where to continue. */
export const purgePage = internalMutation({
	args: { now: v.number(), paginationOpts: paginationOptsValidator },
	handler: async (ctx, args): Promise<{ done: boolean; cursor: string }> => {
		const page = await ctx.db.query("callbackRequests").paginate(args.paginationOpts);
		for (const row of page.page) {
			const action = callbackRetentionAction(
				{
					status: row.status,
					createdAt: row.createdAt,
					handledAt: row.handledAt,
					hasContact: row.contact !== undefined,
				},
				args.now,
			);
			if (action === "delete") await ctx.db.delete(row._id);
			else if (action === "erase_contact") await ctx.db.patch(row._id, { contact: undefined });
		}
		return { done: page.isDone, cursor: page.continueCursor };
	},
});

/** Removes a test tenant's callback requests (the fixture tenants start with `test-`). */
export const dropFixture = internalMutation({
	args: { tenant: v.string() },
	handler: async (ctx, args): Promise<{ deleted: number }> => {
		if (!args.tenant.startsWith("test-")) throw new Error("fixture tenants start with test-");
		const rows = await ctx.db
			.query("callbackRequests")
			.withIndex("by_tenant_created", (q) => q.eq("tenant", args.tenant))
			.collect();
		for (const row of rows) await ctx.db.delete(row._id);
		return { deleted: rows.length };
	},
});

/** Test fixture: ages a request as the clock would (`createdAt`, `handledAt`) so retention can be seen. */
export const ageFixture = internalMutation({
	args: { id: v.id("callbackRequests"), createdAt: v.number(), handledAt: v.optional(v.number()) },
	handler: async (ctx, args): Promise<void> => {
		const row = await ctx.db.get(args.id);
		if (row === null || !row.tenant.startsWith("test-")) throw new Error("fixture rows only");
		await ctx.db.patch(args.id, {
			createdAt: args.createdAt,
			...(args.handledAt === undefined ? {} : { handledAt: args.handledAt }),
		});
	},
});
