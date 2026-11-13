import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { owned } from "./apiSupport";
import { practitionerOf } from "./setupSupport";

/** The column a staff visit sits on and the rows it links to, resolved inside the app. */
export const columnArg = v.object({
	kind: v.union(
		v.literal("practitioner"),
		v.literal("device"),
		v.literal("room"),
		v.literal("group"),
	),
	id: v.string(),
});

export async function resolveColumn(
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

export async function links(
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
