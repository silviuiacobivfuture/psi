import { v } from "convex/values";
import { planChange } from "../src/clinic/change";
import { RECOVERY_DAYS } from "../src/clinic/clients";
import { columnKey, visitProblems } from "../src/clinic/visits";
import { transition } from "../src/domain/lifecycle";
import { MINUTE_MS } from "../src/domain/time";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { requireServer } from "./guard";
import { practitionerOf } from "./setupSupport";
import {
	actorValidator,
	attendanceValidator,
	creditTypeValidator,
	encryptedValidator,
	paymentMethodValidator,
	serverKeyValidator,
} from "./validators";
import { busyOfVisitsInfo } from "./visitConflicts";

/**
 * Staff-made visits for the staff API: create, edit, move, attendance, payment, cancel, soft
 * delete and restore, and reads. A visit may not take a practitioner, room or device another live
 * visit (or, for a practitioner or room, the public flow) already has. Therapist notes arrive and
 * leave as ciphertext.
 */
const columnArg = v.object({
	kind: v.union(
		v.literal("practitioner"),
		v.literal("device"),
		v.literal("room"),
		v.literal("group"),
	),
	id: v.string(),
});

async function resolveColumn(
	ctx: Parameters<typeof owned>[0],
	tenant: string,
	column: { kind: "practitioner" | "device" | "room" | "group"; id: string },
) {
	if (column.kind === "practitioner") {
		const p = await practitionerOf(ctx, tenant, column.id);
		return p === undefined ? null : ({ kind: "practitioner", id: p._id } as const);
	}
	if (column.kind === "device") {
		const d = await owned(ctx, "devices", tenant, column.id);
		return d === null ? null : ({ kind: "device", id: d._id } as const);
	}
	if (column.kind === "room") {
		const r = await owned(ctx, "rooms", tenant, column.id);
		return r === null ? null : ({ kind: "room", id: r._id } as const);
	}
	const g = await owned(ctx, "groupActivities", tenant, column.id);
	return g === null ? null : ({ kind: "group", id: g._id } as const);
}

const body = {
	client: v.optional(v.string()),
	room: v.optional(v.string()),
	device: v.optional(v.string()),
	package: v.optional(v.string()),
	creditType: v.optional(creditTypeValidator),
	sessionType: v.string(),
	notes: v.optional(v.string()),
	therapistNotes: v.optional(encryptedValidator),
	priceMinor: v.optional(v.number()),
	amountPaidMinor: v.optional(v.number()),
	paymentMethod: v.optional(paymentMethodValidator),
};

async function links(
	ctx: Parameters<typeof owned>[0],
	tenant: string,
	a: { client?: string; room?: string; device?: string; package?: string },
): Promise<
	| {
			ok: true;
			client?: Id<"clients">;
			room?: Id<"rooms">;
			device?: Id<"devices">;
			package?: Id<"packages">;
	  }
	| { ok: false; reason: string }
> {
	const client = a.client === undefined ? undefined : await owned(ctx, "clients", tenant, a.client);
	if (client === null || client?.erasedAt !== undefined)
		return { ok: false, reason: "unknown_client" };
	const room = a.room === undefined ? undefined : await owned(ctx, "rooms", tenant, a.room);
	if (room === null) return { ok: false, reason: "unknown_room" };
	const device = a.device === undefined ? undefined : await owned(ctx, "devices", tenant, a.device);
	if (device === null) return { ok: false, reason: "unknown_device" };
	const pack =
		a.package === undefined ? undefined : await owned(ctx, "packages", tenant, a.package);
	if (pack === null) return { ok: false, reason: "unknown_package" };
	return {
		ok: true,
		...(client === undefined ? {} : { client: client._id }),
		...(room === undefined ? {} : { room: room._id }),
		...(device === undefined ? {} : { device: device._id }),
		...(pack === undefined ? {} : { package: pack._id }),
	};
}

const view = (x: Doc<"visits">) => ({ ...x, id: x._id });

export const create = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		column: columnArg,
		start: v.number(),
		end: v.number(),
		...body,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const column = await resolveColumn(ctx, args.tenant, args.column);
		if (column === null) return REFUSED("unknown_column");
		const linked = await links(ctx, args.tenant, args);
		if (!linked.ok) return REFUSED(linked.reason);
		const durationMinutes = Math.round((args.end - args.start) / MINUTE_MS);
		const problems = visitProblems({
			column,
			...(linked.client === undefined ? {} : { client: linked.client }),
			start: args.start,
			end: args.end,
			durationMinutes,
			...(args.priceMinor === undefined ? {} : { priceMinor: args.priceMinor }),
			...(args.amountPaidMinor === undefined ? {} : { amountPaidMinor: args.amountPaidMinor }),
			...(linked.package === undefined ? {} : { package: linked.package }),
			...(args.creditType === undefined ? {} : { creditType: args.creditType }),
		});
		if (problems.length > 0) return REFUSED(problems[0] ?? "invalid");
		const taken = await busyOfVisitsInfo(ctx, args.tenant, {
			column,
			room: linked.room,
			device: linked.device,
			start: args.start,
			end: args.end,
		});
		if (taken !== undefined) return REFUSED("overlaps");
		const now = Date.now();
		const id = await ctx.db.insert("visits", {
			tenant: args.tenant,
			client: linked.client,
			column,
			columnKey: columnKey(column),
			room: linked.room,
			device: linked.device,
			package: linked.package,
			creditType: args.creditType,
			start: args.start,
			end: args.end,
			durationMinutes,
			sessionType: args.sessionType,
			status: "confirmed",
			attendance: "pending",
			notes: args.notes,
			therapistNotes: args.therapistNotes,
			priceMinor: args.priceMinor,
			amountPaidMinor: args.amountPaidMinor,
			paymentMethod: args.paymentMethod,
			reminderSent: false,
			clientConfirmed: false,
			createdBy: args.actor.subject,
			createdAt: now,
			updatedAt: now,
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "visit.create",
			entity: "visit",
			entityId: id,
			kind: "visit",
			version: 1,
		});
		return { ok: true as const, id };
	},
});

/** Edits what is not time or place: type, notes, therapist notes, money, package, reminder and confirmation flags. */
export const update = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.string(),
		expectedVersion: v.optional(v.number()),
		patch: v.object({
			sessionType: v.optional(v.string()),
			notes: v.optional(v.string()),
			therapistNotes: v.optional(encryptedValidator),
			priceMinor: v.optional(v.number()),
			amountPaidMinor: v.optional(v.number()),
			paymentMethod: v.optional(paymentMethodValidator),
			package: v.optional(v.string()),
			creditType: v.optional(creditTypeValidator),
			reminderSent: v.optional(v.boolean()),
			clientConfirmed: v.optional(v.boolean()),
		}),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null || row.deletedAt !== undefined) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		const { package: packageArg, ...rest } = args.patch;
		if ((rest.priceMinor ?? 0) < 0 || (rest.amountPaidMinor ?? 0) < 0)
			return REFUSED("negative_money");
		const linked = await links(ctx, args.tenant, { package: packageArg });
		if (!linked.ok) return REFUSED(linked.reason);
		const patch = { ...rest, ...(linked.package === undefined ? {} : { package: linked.package }) };
		const change = planChange(row, patch);
		if (!change.changed)
			return { ok: true as const, changed: false as const, version: row.version };
		await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now(), version: change.nextVersion });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "visit.update",
			entity: "visit",
			entityId: row._id,
			kind: "visit",
			version: change.nextVersion,
			fields: change.fields,
		});
		return { ok: true as const, changed: true as const, version: change.nextVersion };
	},
});

/** Moves a visit in time or to another column, room or device, refusing what is already taken. */
export const move = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.string(),
		expectedVersion: v.optional(v.number()),
		start: v.number(),
		end: v.number(),
		column: v.optional(columnArg),
		room: v.optional(v.string()),
		device: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null || row.deletedAt !== undefined) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		if (row.status !== "confirmed") return REFUSED("not_allowed");
		const column =
			args.column === undefined ? row.column : await resolveColumn(ctx, args.tenant, args.column);
		if (column === null) return REFUSED("unknown_column");
		const linked = await links(ctx, args.tenant, { room: args.room, device: args.device });
		if (!linked.ok) return REFUSED(linked.reason);
		const room = args.room === undefined ? row.room : linked.room;
		const device = args.device === undefined ? row.device : linked.device;
		const durationMinutes = Math.round((args.end - args.start) / MINUTE_MS);
		const problems = visitProblems({ column, start: args.start, end: args.end, durationMinutes });
		if (problems.length > 0) return REFUSED(problems[0] ?? "invalid");
		const taken = await busyOfVisitsInfo(ctx, args.tenant, {
			column,
			room,
			device,
			start: args.start,
			end: args.end,
			except: row._id,
		});
		if (taken !== undefined) return REFUSED("overlaps");
		const fields = [
			"start",
			"end",
			...(args.column === undefined ? [] : ["column"]),
			...(args.room === undefined ? [] : ["room"]),
			...(args.device === undefined ? [] : ["device"]),
		];
		const version = row.version + 1;
		await ctx.db.patch(row._id, {
			start: args.start,
			end: args.end,
			durationMinutes,
			column,
			columnKey: columnKey(column),
			room,
			device,
			updatedAt: Date.now(),
			version,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "visit.update",
			entity: "visit",
			entityId: row._id,
			kind: "visit",
			version,
			fields,
		});
		return { ok: true as const, version };
	},
});

export const setAttendance = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.string(),
		attendance: attendanceValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null || row.deletedAt !== undefined) return REFUSED("not_found");
		if (row.attendance === args.attendance)
			return { ok: true as const, changed: false as const, version: row.version };
		const version = row.version + 1;
		await ctx.db.patch(row._id, { attendance: args.attendance, updatedAt: Date.now(), version });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "visit.update",
			entity: "visit",
			entityId: row._id,
			kind: "visit",
			version,
			fields: ["attendance"],
		});
		return { ok: true as const, changed: true as const, version };
	},
});

/** What was paid for this visit, and how. */
export const recordPayment = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.string(),
		amountPaidMinor: v.number(),
		method: v.optional(paymentMethodValidator),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null || row.deletedAt !== undefined) return REFUSED("not_found");
		if (!Number.isInteger(args.amountPaidMinor) || args.amountPaidMinor < 0)
			return REFUSED("negative_money");
		const version = row.version + 1;
		await ctx.db.patch(row._id, {
			amountPaidMinor: args.amountPaidMinor,
			paymentMethod: args.method ?? row.paymentMethod,
			updatedAt: Date.now(),
			version,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "visit.update",
			entity: "visit",
			entityId: row._id,
			kind: "visit",
			version,
			fields: ["amountPaidMinor", "paymentMethod"],
		});
		return { ok: true as const, version };
	},
});

export const cancel = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, visit: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null || row.deletedAt !== undefined) return REFUSED("not_found");
		const next = transition({ status: row.status }, { type: "cancel" }, Date.now());
		if (!next.ok) return REFUSED(next.reason);
		const version = row.version + 1;
		await ctx.db.patch(row._id, { status: next.next, updatedAt: Date.now(), version });
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
		return { ok: true as const, version };
	},
});

/** Soft delete, recoverable for 30 days; restore brings it back. */
export const remove = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.string(),
		action: v.union(v.literal("delete"), v.literal("restore")),
		now: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null) return REFUSED("not_found");
		const now = args.now ?? Date.now();
		if (args.action === "delete") {
			if (row.deletedAt !== undefined) return REFUSED("already_deleted");
		} else if (row.deletedAt === undefined) return REFUSED("not_deleted");
		else if (now >= row.deletedAt + RECOVERY_DAYS * 86_400_000) return REFUSED("recovery_expired");
		const version = row.version + 1;
		await ctx.db.patch(row._id, {
			deletedAt: args.action === "delete" ? now : undefined,
			updatedAt: now,
			version,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: args.action === "delete" ? "visit.cancel" : "visit.update",
			entity: "visit",
			entityId: row._id,
			kind: "visit",
			version,
			fields: ["deletedAt"],
		});
		return { ok: true as const, version };
	},
});

export const get = query({
	args: { key: serverKeyValidator, tenant: v.string(), visit: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		return row === null ? REFUSED("not_found") : { ok: true as const, visit: view(row) };
	},
});

/** Visits between two instants, optionally of one column or one client; soft-deleted ones only when asked. */
export const list = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		from: v.number(),
		to: v.number(),
		column: v.optional(columnArg),
		client: v.optional(v.string()),
		deleted: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.to <= args.from || args.to - args.from > 93 * 86_400_000)
			return REFUSED("invalid_range");
		const rows = await ctx.db
			.query("visits")
			.withIndex("by_tenant_start", (q) =>
				q.eq("tenant", args.tenant).gte("start", args.from).lt("start", args.to),
			)
			.collect();
		const wantColumn =
			args.column === undefined ? undefined : `${args.column.kind}:${args.column.id}`;
		const shown = rows.filter(
			(r) =>
				(args.deleted ?? false) === (r.deletedAt !== undefined) &&
				(wantColumn === undefined || r.columnKey === wantColumn) &&
				(args.client === undefined || r.client === args.client),
		);
		return { ok: true as const, visits: shown.map(view) };
	},
});
