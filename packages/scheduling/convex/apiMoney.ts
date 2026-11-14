import { v } from "convex/values";
import { planChange } from "../src/clinic/change";
import { isLocalDate } from "../src/domain/time";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { PER_CLIENT_MAX, TOO_MANY_ROWS, within } from "./bounded";
import { requireServer } from "./guard";
import { actorValidator, paymentMethodValidator, serverKeyValidator } from "./validators";

/**
 * Packages and their payments ledger for the staff API. The ledger is append-only: money in is a
 * positive line, a refund a negative one, and what is paid is their sum. What a package has used is
 * never stored: the API derives it from `forClient`'s visits.
 */
const terms = {
	sessionType: v.string(),
	totalSessions: v.number(),
	bonusSessions: v.number(),
	priceMinor: v.number(),
	startDate: v.optional(v.string()),
	notes: v.optional(v.string()),
};

const sound = (t: {
	totalSessions: number;
	bonusSessions: number;
	priceMinor: number;
	startDate?: string;
	sessionType: string;
}): boolean =>
	Number.isInteger(t.totalSessions) &&
	Number.isInteger(t.bonusSessions) &&
	Number.isInteger(t.priceMinor) &&
	t.totalSessions >= 0 &&
	t.bonusSessions >= 0 &&
	t.priceMinor >= 0 &&
	t.sessionType.trim() !== "" &&
	(t.startDate === undefined || isLocalDate(t.startDate));

export const createPackage = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		client: v.string(),
		...terms,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const client = await owned(ctx, "clients", args.tenant, args.client);
		if (client === null || client.erasedAt !== undefined) return REFUSED("unknown_client");
		if (!sound(args)) return REFUSED("invalid");
		const now = Date.now();
		const id = await ctx.db.insert("packages", {
			tenant: args.tenant,
			client: client._id,
			sessionType: args.sessionType,
			totalSessions: args.totalSessions,
			bonusSessions: args.bonusSessions,
			priceMinor: args.priceMinor,
			startDate: args.startDate,
			notes: args.notes,
			createdAt: now,
			updatedAt: now,
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "package.create",
			entity: "package",
			entityId: id,
			kind: "package",
			version: 1,
		});
		return { ok: true as const, id };
	},
});

export const updatePackage = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		package: v.string(),
		expectedVersion: v.optional(v.number()),
		patch: v.object({
			sessionType: v.optional(v.string()),
			totalSessions: v.optional(v.number()),
			bonusSessions: v.optional(v.number()),
			priceMinor: v.optional(v.number()),
			startDate: v.optional(v.string()),
			notes: v.optional(v.string()),
		}),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "packages", args.tenant, args.package);
		if (row === null) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		if (!sound({ ...row, ...args.patch })) return REFUSED("invalid");
		const change = planChange(row, args.patch);
		if (!change.changed)
			return { ok: true as const, changed: false as const, version: row.version };
		await ctx.db.patch(row._id, {
			...args.patch,
			updatedAt: Date.now(),
			version: change.nextVersion,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "package.update",
			entity: "package",
			entityId: row._id,
			kind: "package",
			version: change.nextVersion,
			fields: change.fields,
		});
		return { ok: true as const, changed: true as const, version: change.nextVersion };
	},
});

/** Deleting a package is allowed only while nothing hangs on it: no linked visit, no payment. */
export const removePackage = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, package: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "packages", args.tenant, args.package);
		if (row === null) return REFUSED("not_found");
		const visit = await ctx.db
			.query("visits")
			.withIndex("by_tenant_package_start", (q) =>
				q.eq("tenant", args.tenant).eq("package", row._id),
			)
			.first();
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_tenant_package", (q) => q.eq("tenant", args.tenant).eq("package", row._id))
			.first();
		if (visit !== null || payment !== null) return REFUSED("in_use");
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "package.update",
			entity: "package",
			entityId: row._id,
			kind: "package",
			version: row.version + 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});

/** Appends a ledger line: positive is money in, negative a refund. Never zero, never edited afterwards. */
export const addPayment = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		client: v.string(),
		package: v.optional(v.string()),
		amountMinor: v.number(),
		method: v.optional(paymentMethodValidator),
		at: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const client = await owned(ctx, "clients", args.tenant, args.client);
		if (client === null || client.erasedAt !== undefined) return REFUSED("unknown_client");
		const pack =
			args.package === undefined
				? undefined
				: await owned(ctx, "packages", args.tenant, args.package);
		if (pack === null || (pack !== undefined && pack.client !== client._id))
			return REFUSED("unknown_package");
		if (!Number.isInteger(args.amountMinor) || args.amountMinor === 0) return REFUSED("invalid");
		const id = await ctx.db.insert("payments", {
			tenant: args.tenant,
			client: client._id,
			package: pack?._id,
			amountMinor: args.amountMinor,
			method: args.method,
			at: args.at ?? Date.now(),
			createdBy: args.actor.subject,
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: args.amountMinor < 0 ? "payment.refund" : "payment.add",
			entity: "payment",
			entityId: id,
			kind: "payment",
			version: 1,
		});
		return { ok: true as const, id };
	},
});

/** A client's packages with their ledger and the facts of their linked visits (the API derives usage and money). */
export const forClient = query({
	args: { key: serverKeyValidator, tenant: v.string(), client: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const client = await owned(ctx, "clients", args.tenant, args.client);
		if (client === null) return REFUSED("not_found");
		const packages = await within(
			ctx.db
				.query("packages")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", client._id)),
			PER_CLIENT_MAX,
		);
		const payments = await within(
			ctx.db
				.query("payments")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", client._id)),
			PER_CLIENT_MAX,
		);
		if (packages === undefined || payments === undefined) return REFUSED(TOO_MANY_ROWS);
		const out = [];
		for (const p of packages) {
			const visits = await within(
				ctx.db
					.query("visits")
					.withIndex("by_tenant_package_start", (q) =>
						q.eq("tenant", args.tenant).eq("package", p._id),
					),
				PER_CLIENT_MAX,
			);
			if (visits === undefined) return REFUSED(TOO_MANY_ROWS);
			out.push({
				...p,
				id: p._id,
				payments: payments
					.filter((x) => x.package === p._id)
					.map((x) => ({ id: x._id, amountMinor: x.amountMinor, method: x.method, at: x.at })),
				visits: visits
					.filter((x) => x.deletedAt === undefined)
					.map((x) => ({
						id: x._id,
						status: x.status,
						attendance: x.attendance,
						creditType: x.creditType ?? "base",
						start: x.start,
					})),
			});
		}
		return {
			ok: true as const,
			packages: out,
			unassigned: payments
				.filter((x) => x.package === undefined)
				.map((x) => ({ id: x._id, amountMinor: x.amountMinor, method: x.method, at: x.at })),
		};
	},
});
