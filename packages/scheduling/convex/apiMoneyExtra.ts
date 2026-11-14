import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { PER_CLIENT_MAX, TOO_MANY_ROWS, within } from "./bounded";
import { logChange } from "./changeLog";
import { requireServer } from "./guard";
import {
	actorValidator,
	paymentMethodValidator,
	serverKeyValidator,
	visitMetaValidator,
} from "./validators";

/**
 * What the staff API needs beyond `apiVisits` and `apiMoney` (additive; nothing there changes): the API's own facts about
 * a visit, a visit search that is not capped to a window, the offer on a package, a package by id, and the payments
 * ledger with its link to a visit, its note, and a delete. Every write is audited once and on the change feed.
 */
const MAX_ROWS = 10000;

/** The API's facts about a visit (kind, practitioner, group, service, cancel reason): replaced as a whole. */
export const setVisitMeta = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.string(),
		meta: visitMetaValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null || row.deletedAt !== undefined) return REFUSED("not_found");
		if (args.meta.practitioner.trim() === "") return REFUSED("invalid");
		const version = row.version + 1;
		await ctx.db.patch(row._id, { meta: args.meta, updatedAt: Date.now(), version });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "visit.update",
			entity: "visit",
			entityId: row._id,
			kind: "visit",
			version,
			fields: ["meta"],
		});
		return { ok: true as const, version };
	},
});

const view = (x: Doc<"visits">) => ({ ...x, id: x._id });

/** Visits of an app, soft-deleted ones included (they say so), narrowed by what the API asks; no window cap. */
export const searchVisits = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		from: v.optional(v.number()),
		to: v.optional(v.number()),
		client: v.optional(v.string()),
		columnKey: v.optional(v.string()),
		room: v.optional(v.string()),
		device: v.optional(v.string()),
		package: v.optional(v.string()),
		/** The API's person id (a visit's meta), or the column of a visit that has none (`practitioner:<id>`). */
		practitioner: v.optional(v.string()),
		practitionerColumn: v.optional(v.string()),
		group: v.optional(v.string()),
		groupColumn: v.optional(v.string()),
		service: v.optional(v.string()),
		/** Only visits whose reminder was sent or confirmed. */
		reminded: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		// A filter that has an index of its own reads only its rows: a clinic's package or client is a few dozen visits,
		// its whole history is thousands, and a console asks for many packages at once. An id that names nothing
		// matches nothing.
		const { tenant } = args;
		const visits = ctx.db.query("visits");
		const packageId =
			args.package === undefined ? undefined : ctx.db.normalizeId("packages", args.package);
		const clientId =
			args.client === undefined ? undefined : ctx.db.normalizeId("clients", args.client);
		const roomId = args.room === undefined ? undefined : ctx.db.normalizeId("rooms", args.room);
		const deviceId =
			args.device === undefined ? undefined : ctx.db.normalizeId("devices", args.device);
		const unknownId = [
			[args.package, packageId],
			[args.client, clientId],
			[args.room, roomId],
			[args.device, deviceId],
		].some(([given, found]) => given !== undefined && found === null);
		if (unknownId) return { ok: true as const, visits: [] };
		// The indexed reads are by equality; the window is applied below, to the few rows they return.
		const rows = await (packageId
			? visits.withIndex("by_tenant_package_start", (q) =>
					q.eq("tenant", tenant).eq("package", packageId),
				)
			: clientId
				? visits.withIndex("by_tenant_client_start", (q) =>
						q.eq("tenant", tenant).eq("client", clientId),
					)
				: roomId
					? visits.withIndex("by_tenant_room_start", (q) =>
							q.eq("tenant", tenant).eq("room", roomId),
						)
					: deviceId
						? visits.withIndex("by_tenant_device_start", (q) =>
								q.eq("tenant", tenant).eq("device", deviceId),
							)
						: visits.withIndex("by_tenant_start", (q) => {
								const base = q.eq("tenant", tenant);
								if (args.from !== undefined && args.to !== undefined)
									return base.gte("start", args.from).lt("start", args.to);
								if (args.from !== undefined) return base.gte("start", args.from);
								if (args.to !== undefined) return base.lt("start", args.to);
								return base;
							})
		).take(MAX_ROWS + 1);
		if (rows.length > MAX_ROWS) return REFUSED("too_many");
		const shown = rows.filter(
			(r) =>
				(args.from === undefined || r.start >= args.from) &&
				(args.to === undefined || r.start < args.to) &&
				(args.client === undefined || r.client === args.client) &&
				(args.columnKey === undefined || r.columnKey === args.columnKey) &&
				(args.room === undefined || r.room === args.room) &&
				(args.device === undefined || r.device === args.device) &&
				(args.package === undefined || r.package === args.package) &&
				(args.practitioner === undefined ||
					(r.meta === undefined
						? r.columnKey === args.practitionerColumn
						: r.meta.practitioner === args.practitioner)) &&
				(args.group === undefined ||
					(r.meta === undefined
						? r.columnKey === args.groupColumn
						: r.meta.group === args.group)) &&
				(args.service === undefined || r.meta?.service === args.service) &&
				(args.reminded !== true ||
					(r.deletedAt === undefined && (r.reminderSent || r.clientConfirmed))),
		);
		return { ok: true as const, visits: shown.map(view) };
	},
});

/** The offer on a package, in bani (the price stays `apiMoney`'s). */
export const setPackageDiscount = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		package: v.string(),
		discountMinor: v.number(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "packages", args.tenant, args.package);
		if (row === null) return REFUSED("not_found");
		if (!Number.isInteger(args.discountMinor) || args.discountMinor < 0) return REFUSED("invalid");
		if (args.discountMinor > row.priceMinor) return REFUSED("invalid");
		if ((row.discountMinor ?? 0) === args.discountMinor)
			return { ok: true as const, changed: false as const, version: row.version };
		const version = row.version + 1;
		await ctx.db.patch(row._id, {
			discountMinor: args.discountMinor,
			updatedAt: Date.now(),
			version,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "package.update",
			entity: "package",
			entityId: row._id,
			kind: "package",
			version,
			fields: ["discountMinor"],
		});
		return { ok: true as const, changed: true as const, version };
	},
});

export const packageById = query({
	args: { key: serverKeyValidator, tenant: v.string(), package: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "packages", args.tenant, args.package);
		return row === null
			? REFUSED("not_found")
			: { ok: true as const, package: { ...row, id: row._id } };
	},
});

const line = (x: Doc<"payments">) => ({ ...x, id: x._id });

/** Ledger lines, by package, client, visit or id; with none of them, every line of the app. */
export const ledger = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		package: v.optional(v.string()),
		client: v.optional(v.string()),
		visit: v.optional(v.string()),
		payment: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.payment !== undefined) {
			const row = await owned(ctx, "payments", args.tenant, args.payment);
			return { ok: true as const, lines: row === null ? [] : [line(row)] };
		}
		if (args.package !== undefined) {
			const pack = await owned(ctx, "packages", args.tenant, args.package);
			if (pack === null) return { ok: true as const, lines: [] };
			const lines = await within(
				ctx.db
					.query("payments")
					.withIndex("by_tenant_package", (q) =>
						q.eq("tenant", args.tenant).eq("package", pack._id),
					),
				PER_CLIENT_MAX,
			);
			if (lines === undefined) return REFUSED(TOO_MANY_ROWS);
			return { ok: true as const, lines: lines.map(line) };
		}
		if (args.client !== undefined) {
			const client = await owned(ctx, "clients", args.tenant, args.client);
			if (client === null) return { ok: true as const, lines: [] };
			const lines = await within(
				ctx.db
					.query("payments")
					.withIndex("by_tenant_client", (q) =>
						q.eq("tenant", args.tenant).eq("client", client._id),
					),
				PER_CLIENT_MAX,
			);
			if (lines === undefined) return REFUSED(TOO_MANY_ROWS);
			return { ok: true as const, lines: lines.map(line) };
		}
		if (args.visit !== undefined) {
			const visit = await owned(ctx, "visits", args.tenant, args.visit);
			const clientId = visit?.client;
			if (visit === null || clientId === undefined) return { ok: true as const, lines: [] };
			const lines = await within(
				ctx.db
					.query("payments")
					.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", clientId)),
				PER_CLIENT_MAX,
			);
			if (lines === undefined) return REFUSED(TOO_MANY_ROWS);
			return { ok: true as const, lines: lines.filter((x) => x.visit === visit._id).map(line) };
		}
		const lines = await ctx.db
			.query("payments")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant))
			.take(MAX_ROWS + 1);
		return lines.length > MAX_ROWS
			? REFUSED("too_many")
			: { ok: true as const, lines: lines.map(line) };
	},
});

/** Every package of the app, or of one client. */
export const packages = query({
	args: { key: serverKeyValidator, tenant: v.string(), client: v.optional(v.string()) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.client !== undefined) {
			const client = await owned(ctx, "clients", args.tenant, args.client);
			if (client === null) return { ok: true as const, packages: [] };
			const rows = await within(
				ctx.db
					.query("packages")
					.withIndex("by_tenant_client", (q) =>
						q.eq("tenant", args.tenant).eq("client", client._id),
					),
				PER_CLIENT_MAX,
			);
			if (rows === undefined) return REFUSED(TOO_MANY_ROWS);
			return { ok: true as const, packages: rows.map((p) => ({ ...p, id: p._id })) };
		}
		const rows = await ctx.db
			.query("packages")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant))
			.take(MAX_ROWS + 1);
		return rows.length > MAX_ROWS
			? REFUSED("too_many")
			: { ok: true as const, packages: rows.map((p) => ({ ...p, id: p._id })) };
	},
});

/**
 * A ledger line with its note and, when taken for one appointment, its visit: the visit's amount paid follows in the same
 * transaction, so the two can never disagree. One audit event.
 */
export const addLedgerPayment = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		client: v.string(),
		package: v.optional(v.string()),
		visit: v.optional(v.string()),
		amountMinor: v.number(),
		method: v.optional(paymentMethodValidator),
		at: v.optional(v.number()),
		note: v.optional(v.string()),
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
		const visit =
			args.visit === undefined ? undefined : await owned(ctx, "visits", args.tenant, args.visit);
		if (
			visit === null ||
			(visit !== undefined && (visit.deletedAt !== undefined || visit.client !== client._id))
		)
			return REFUSED("unknown_visit");
		if (!Number.isInteger(args.amountMinor) || args.amountMinor === 0) return REFUSED("invalid");
		const id = await ctx.db.insert("payments", {
			tenant: args.tenant,
			client: client._id,
			package: pack?._id,
			visit: visit?._id,
			amountMinor: args.amountMinor,
			method: args.method,
			note: args.note,
			at: args.at ?? Date.now(),
			createdBy: args.actor.subject,
			version: 1,
		});
		if (visit !== undefined) {
			const version = visit.version + 1;
			await ctx.db.patch(visit._id, {
				amountPaidMinor: Math.max(0, (visit.amountPaidMinor ?? 0) + args.amountMinor),
				paymentMethod: args.method ?? visit.paymentMethod,
				updatedAt: Date.now(),
				version,
			});
			await logChange(ctx, args.tenant, "visit", visit._id, version);
		}
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

/** Deletes a ledger line (audited as a refund of it); a linked visit's amount paid follows. */
export const removeLedgerPayment = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, payment: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "payments", args.tenant, args.payment);
		if (row === null) return REFUSED("not_found");
		if (row.visit !== undefined) {
			const visit = await ctx.db.get(row.visit);
			if (visit !== null && visit.deletedAt === undefined) {
				const version = visit.version + 1;
				await ctx.db.patch(visit._id, {
					amountPaidMinor: Math.max(0, (visit.amountPaidMinor ?? 0) - row.amountMinor),
					updatedAt: Date.now(),
					version,
				});
				await logChange(ctx, args.tenant, "visit", visit._id, version);
			}
		}
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "payment.refund",
			entity: "payment",
			entityId: row._id,
			kind: "payment",
			version: row.version + 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});
