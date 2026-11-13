import { v } from "convex/values";
import type { ChangeKind } from "../src/clinic/changes";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { REFUSED, record } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * What the staff API's catalogue (people, rooms, devices, group activities, services, clients) needs and the other
 * wrappers do not give: full-row readers for the tables whose readers leave columns out, one `extra` text column per
 * table for the facts the API holds that no column does (a device's room, a group's kind and members, a service's
 * prices, a client's money and address), the practitioner's account and colour, and a guarded delete. `extra` is
 * JSON text the service parses; Convex never reads it, and it goes with the row when a client is erased.
 */
const EXTRA_MAX = 20_000;

const tableValidator = v.union(
	v.literal("practitioners"),
	v.literal("staffMembers"),
	v.literal("rooms"),
	v.literal("devices"),
	v.literal("groupActivities"),
	v.literal("services"),
	v.literal("clients"),
);
type Table =
	| "practitioners"
	| "staffMembers"
	| "rooms"
	| "devices"
	| "groupActivities"
	| "services"
	| "clients";

/** A row of the app by the id the caller holds, or null (not an id of that table, or another app's). */
async function owned<T extends Table>(
	ctx: QueryCtx,
	table: T,
	tenant: string,
	id: string,
): Promise<Doc<T> | null> {
	const normal = ctx.db.normalizeId(table, id);
	if (normal === null) return null;
	const row = await ctx.db.get(normal);
	return row !== null && row.tenant === tenant ? row : null;
}

const KIND: Record<Table, ChangeKind> = {
	practitioners: "person",
	staffMembers: "person",
	rooms: "room",
	devices: "device",
	groupActivities: "group",
	services: "builder",
	clients: "client",
};

const view = <T extends { _id: string; _creationTime: number }>(row: T) => ({
	...row,
	id: row._id,
	createdAt: row._creationTime,
});

export const practitioners = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("practitioners")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		return { ok: true as const, practitioners: rows.map(view) };
	},
});

export const rooms = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("rooms")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		return { ok: true as const, rooms: rows.map(view) };
	},
});

export const services = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("services")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		return { ok: true as const, services: rows.map(view) };
	},
});

/**
 * Sets (or, with null, clears) a row's `extra`; for a practitioner also the sign-in subject and the colour, which have
 * columns but no other wrapper. Audited, on the change feed.
 */
export const setExtra = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		table: tableValidator,
		id: v.string(),
		extra: v.optional(v.union(v.string(), v.null())),
		staffSubject: v.optional(v.union(v.string(), v.null())),
		color: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.extra !== undefined && args.extra !== null && args.extra.length > EXTRA_MAX)
			return REFUSED("invalid");
		if (
			args.table !== "practitioners" &&
			(args.staffSubject !== undefined || args.color !== undefined)
		)
			return REFUSED("invalid");
		const row = await owned(ctx, args.table, args.tenant, args.id);
		if (
			row === null ||
			(args.table === "clients" && "erasedAt" in row && row.erasedAt !== undefined)
		)
			return REFUSED("not_found");
		if (typeof args.staffSubject === "string" && args.staffSubject.trim() === "")
			return REFUSED("invalid");
		const patch: Record<string, string | number | undefined> = {};
		if (args.extra !== undefined) patch.extra = args.extra === null ? undefined : args.extra;
		if (args.staffSubject !== undefined)
			patch.staffSubject = args.staffSubject === null ? undefined : args.staffSubject;
		if (args.color !== undefined) patch.color = args.color === null ? undefined : args.color;
		const version = "version" in row && typeof row.version === "number" ? row.version + 1 : 1;
		if (args.table === "clients" || "version" in row) patch.version = version;
		await ctx.db.patch(row._id, patch);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: args.table === "clients" ? "client.update" : "builder.change",
			entity: args.table === "clients" ? "client" : "builder",
			entityId: row._id,
			kind: KIND[args.table],
			version,
			fields: Object.keys(patch).filter((k) => k !== "version"),
		});
		return { ok: true as const };
	},
});

const removable = v.union(
	v.literal("practitioners"),
	v.literal("staffMembers"),
	v.literal("rooms"),
	v.literal("devices"),
	v.literal("groupActivities"),
	v.literal("services"),
);
type Removable = Exclude<Table, "clients">;

async function inUse(
	ctx: QueryCtx,
	tenant: string,
	table: Removable,
	row: { _id: string },
): Promise<boolean> {
	const id = row._id as string;
	const column = (kind: string) =>
		ctx.db
			.query("visits")
			.withIndex("by_tenant_column_start", (q) =>
				q.eq("tenant", tenant).eq("columnKey", `${kind}:${id}`),
			)
			.first();
	const person = (kind: string) =>
		ctx.db
			.query("rosterDays")
			.withIndex("by_tenant_person_date", (q) =>
				q.eq("tenant", tenant).eq("personKey", `${kind}:${id}`),
			)
			.first();
	const block = (kind: string) =>
		ctx.db
			.query("staffBlocks")
			.withIndex("by_tenant_person_start", (q) =>
				q.eq("tenant", tenant).eq("personKey", `${kind}:${id}`),
			)
			.first();
	if (table === "practitioners") {
		const treating = await ctx.db
			.query("treating")
			.withIndex("by_tenant_practitioner", (q) =>
				q.eq("tenant", tenant).eq("practitioner", row._id as Id<"practitioners">),
			)
			.first();
		const appointment = await ctx.db
			.query("appointments")
			.withIndex("by_practitioner_start", (q) =>
				q.eq("practitioner", row._id as Id<"practitioners">),
			)
			.first();
		const offered = (
			await ctx.db
				.query("services")
				.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant))
				.collect()
		).some((s) => s.practitioners.some((p) => p === row._id));
		return (
			treating !== null ||
			appointment !== null ||
			offered ||
			(await column("practitioner")) !== null ||
			(await person("practitioner")) !== null ||
			(await block("practitioner")) !== null
		);
	}
	if (table === "staffMembers")
		return (await person("staff")) !== null || (await block("staff")) !== null;
	if (table === "devices")
		return (
			(await ctx.db
				.query("visits")
				.withIndex("by_tenant_device_start", (q) =>
					q.eq("tenant", tenant).eq("device", row._id as Id<"devices">),
				)
				.first()) !== null || (await column("device")) !== null
		);
	if (table === "groupActivities") return (await column("group")) !== null;
	if (table === "rooms")
		return (
			(await ctx.db
				.query("visits")
				.withIndex("by_tenant_room_start", (q) =>
					q.eq("tenant", tenant).eq("room", row._id as Id<"rooms">),
				)
				.first()) !== null ||
			(await ctx.db
				.query("appointments")
				.withIndex("by_room_start", (q) => q.eq("room", row._id as Id<"rooms">))
				.first()) !== null ||
			(await column("room")) !== null
		);
	return (
		(await ctx.db
			.query("appointments")
			.withIndex("by_tenant_start", (q) => q.eq("tenant", tenant))
			.filter((q) => q.eq(q.field("service"), row._id))
			.first()) !== null
	);
}

/**
 * Deletes a catalogue row nothing refers to; one that is referred to is `in_use` (deactivate it instead). A
 * practitioner's rules and exceptions, a room's closures go with it: they are its settings, not history.
 */
export const removeRow = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		table: removable,
		id: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, args.table, args.tenant, args.id);
		if (row === null) return REFUSED("not_found");
		if (await inUse(ctx, args.tenant, args.table, row)) return REFUSED("in_use");
		if (args.table === "practitioners") {
			const practitioner = row._id as Id<"practitioners">;
			for (const r of await ctx.db
				.query("rules")
				.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner))
				.collect())
				await ctx.db.delete(r._id);
			for (const e of await ctx.db
				.query("exceptions")
				.withIndex("by_practitioner_date", (q) => q.eq("practitioner", practitioner))
				.collect())
				await ctx.db.delete(e._id);
		}
		if (args.table === "rooms") {
			const room = row._id as Id<"rooms">;
			for (const c of await ctx.db
				.query("roomClosures")
				.withIndex("by_room_date", (q) => q.eq("room", room))
				.collect())
				await ctx.db.delete(c._id);
		}
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: row._id,
			kind: KIND[args.table],
			version: 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});

/**
 * The clients of an app a page at a time, by name, whole rows (the list wrapper stops at 500). `standing` picks
 * the listed, archived, deleted or all; an erased client (a content-free tombstone) is never returned.
 */
export const clientsPage = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		standing: v.union(
			v.literal("active"),
			v.literal("archived"),
			v.literal("deleted"),
			v.literal("all"),
		),
		cursor: v.union(v.string(), v.null()),
		numItems: v.number(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const page = await ctx.db
			.query("clients")
			.withIndex("by_tenant_name", (q) => q.eq("tenant", args.tenant))
			.paginate({
				cursor: args.cursor,
				numItems: Math.max(1, Math.min(500, Math.floor(args.numItems))),
			});
		const standing = (c: Doc<"clients">): "active" | "archived" | "deleted" =>
			c.deletedAt !== undefined ? "deleted" : c.archivedAt !== undefined ? "archived" : "active";
		return {
			ok: true as const,
			clients: page.page
				.filter(
					(c) =>
						c.erasedAt === undefined && (args.standing === "all" || standing(c) === args.standing),
				)
				.map(view),
			continueCursor: page.continueCursor,
			isDone: page.isDone,
		};
	},
});
