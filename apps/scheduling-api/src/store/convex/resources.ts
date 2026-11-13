import { ROOM_KINDS } from "@psi/scheduling";
import { z } from "zod";
import type { Collection, DeviceRow, GroupRow, RoomRow } from "../types";
import { StoreRefused } from "../types";
import { actorArg, type Caller } from "./call";
import { catalogCollection } from "./catalog-collection";
import { readExtra, writeExtra } from "./extra";
import { slugFor } from "./slug";

/**
 * Rooms, devices and group activities. Each has columns for what Convex models (name, active; a room's kind,
 * capacity) and an `extra` for what the API adds: a room's free-text kind and optional capacity (Convex takes a fixed
 * list of kinds and a capacity of 1..50), a device's room, a group's kind and member clients. Where `extra` has a
 * value it wins on read; the columns always hold a valid approximation (kind `other`, capacity clamped) so Convex's own
 * functions keep working on the row.
 */
const FN = "apiCatalogExtra";
const stamp = (n: number): number => Math.floor(n);
const Base = {
	id: z.string(),
	_creationTime: z.number(),
	updatedAt: z.number().optional(),
	extra: z.string().optional(),
};

const Room = z.object({
	...Base,
	name: z.string(),
	kind: z.string(),
	capacity: z.number(),
	active: z.boolean(),
});
const RoomExtra = z.object({
	kind: z.string(),
	capacity: z.number().optional(),
	floor: z.string().optional(),
	purpose: z.string().optional(),
	bookable: z.boolean().optional(),
	homePractitionerId: z.string().optional(),
});

const Device = z.object({ ...Base, name: z.string(), active: z.boolean() });
const DeviceExtra = z.object({
	roomId: z.string().optional(),
	deviceType: z.enum(["nfb", "qeeg", "other"]).optional(),
	bookable: z.boolean().optional(),
});
const deviceExtraOf = (d: DeviceRow): Record<string, unknown> => ({
	...(d.roomId === undefined ? {} : { roomId: d.roomId }),
	...(d.deviceType === undefined ? {} : { deviceType: d.deviceType }),
	...(d.bookable === undefined ? {} : { bookable: d.bookable }),
});

const Group = z.object({ ...Base, name: z.string(), active: z.boolean() });
const GroupExtra = z.object({ kind: z.enum(["group", "atelier"]), clientIds: z.array(z.string()) });

const nativeKind = (kind: string): string => (ROOM_KINDS.some((k) => k === kind) ? kind : "other");
const nativeCapacity = (capacity: number | undefined): number =>
	Math.max(1, Math.min(50, capacity ?? 1));

const removed = async (call: Caller, app: string, table: string, id: string): Promise<boolean> => {
	try {
		await call.mutate(`${FN}:removeRow`, { tenant: app, actor: actorArg(), table, id }, {});
		return true;
	} catch (error) {
		if (error instanceof StoreRefused && error.reason === "not_found") return false;
		throw error;
	}
};

const setExtra = (call: Caller, app: string, table: string, id: string, extra: unknown) =>
	call.mutate(
		`${FN}:setExtra`,
		{ tenant: app, actor: actorArg(), table, id, extra: writeExtra(extra) },
		{},
	);

export function roomsCollection(call: Caller): Collection<RoomRow> {
	const extraOf = (r: RoomRow) => ({
		kind: r.kind,
		...(r.capacity === undefined ? {} : { capacity: r.capacity }),
		...(r.floor === undefined ? {} : { floor: r.floor }),
		...(r.purpose === undefined ? {} : { purpose: r.purpose }),
		...(r.bookable === undefined ? {} : { bookable: r.bookable }),
		...(r.homePractitionerId === undefined ? {} : { homePractitionerId: r.homePractitionerId }),
	});
	return catalogCollection<RoomRow>({
		async all(app) {
			const out = await call.query(`${FN}:rooms`, { tenant: app }, { rooms: z.array(Room) });
			return out.rooms.map((d) => {
				const extra = readExtra(RoomExtra, d.extra);
				const capacity = extra === undefined ? d.capacity : extra.capacity;
				return {
					id: d.id,
					app,
					name: d.name,
					kind: extra?.kind ?? d.kind,
					...(capacity === undefined ? {} : { capacity }),
					...(extra?.floor === undefined ? {} : { floor: extra.floor }),
					...(extra?.purpose === undefined ? {} : { purpose: extra.purpose }),
					...(extra?.bookable === undefined ? {} : { bookable: extra.bookable }),
					...(extra?.homePractitionerId === undefined
						? {}
						: { homePractitionerId: extra.homePractitionerId }),
					active: d.active,
					createdAt: stamp(d._creationTime),
					updatedAt: stamp(d.updatedAt ?? d._creationTime),
				};
			});
		},
		async create(row) {
			const made = await call.mutate(
				"staffRooms:createRoom",
				{
					tenant: row.app,
					slug: slugFor(row.name),
					name: row.name,
					kind: nativeKind(row.kind),
					capacity: nativeCapacity(row.capacity),
					suits: ["child", "teen", "adult"],
					equipment: [],
					actor: actorArg(),
				},
				{ id: z.string() },
			);
			await setExtra(call, row.app, "rooms", made.id, extraOf(row));
			if (!row.active)
				await call.mutate(
					"staffRooms:updateRoom",
					{ tenant: row.app, room: made.id, patch: { active: false }, actor: actorArg() },
					{},
				);
			return { ...row, id: made.id };
		},
		async update(before, after) {
			if (
				before.name !== after.name ||
				before.active !== after.active ||
				before.kind !== after.kind ||
				before.capacity !== after.capacity
			)
				await call.mutate(
					"staffRooms:updateRoom",
					{
						tenant: after.app,
						room: after.id,
						actor: actorArg(),
						patch: {
							name: after.name,
							kind: nativeKind(after.kind),
							capacity: nativeCapacity(after.capacity),
							active: after.active,
						},
					},
					{},
				);
			if (JSON.stringify(extraOf(before)) !== JSON.stringify(extraOf(after)))
				await setExtra(call, after.app, "rooms", after.id, extraOf(after));
		},
		remove: (app, id) => removed(call, app, "rooms", id),
	});
}

export function devicesCollection(call: Caller): Collection<DeviceRow> {
	return catalogCollection<DeviceRow>({
		async all(app) {
			const out = await call.query(
				"apiResources:devices",
				{ tenant: app },
				{ devices: z.array(Device) },
			);
			return out.devices.map((d) => {
				const extra = readExtra(DeviceExtra, d.extra);
				return {
					id: d.id,
					app,
					name: d.name,
					...(extra?.roomId === undefined ? {} : { roomId: extra.roomId }),
					...(extra?.deviceType === undefined ? {} : { deviceType: extra.deviceType }),
					...(extra?.bookable === undefined ? {} : { bookable: extra.bookable }),
					active: d.active,
					createdAt: stamp(d._creationTime),
					updatedAt: stamp(d.updatedAt ?? d._creationTime),
				};
			});
		},
		async create(row) {
			const made = await call.mutate(
				"apiResources:createDevice",
				{
					tenant: row.app,
					actor: actorArg(),
					slug: slugFor(row.name),
					name: row.name,
					kind: "other",
				},
				{ id: z.string() },
			);
			if (Object.keys(deviceExtraOf(row)).length > 0)
				await setExtra(call, row.app, "devices", made.id, deviceExtraOf(row));
			if (!row.active)
				await call.mutate(
					"apiResources:updateDevice",
					{ tenant: row.app, actor: actorArg(), device: made.id, patch: { active: false } },
					{},
				);
			return { ...row, id: made.id };
		},
		async update(before, after) {
			if (before.name !== after.name || before.active !== after.active)
				await call.mutate(
					"apiResources:updateDevice",
					{
						tenant: after.app,
						actor: actorArg(),
						device: after.id,
						patch: { name: after.name, active: after.active },
					},
					{},
				);
			if (JSON.stringify(deviceExtraOf(before)) !== JSON.stringify(deviceExtraOf(after)))
				await setExtra(call, after.app, "devices", after.id, deviceExtraOf(after));
		},
		remove: (app, id) => removed(call, app, "devices", id),
	});
}

export function groupsCollection(call: Caller): Collection<GroupRow> {
	const extraOf = (g: GroupRow) => ({ kind: g.kind, clientIds: g.clientIds });
	return catalogCollection<GroupRow>({
		async all(app) {
			const out = await call.query(
				"apiResources:groups",
				{ tenant: app },
				{ groups: z.array(Group) },
			);
			return out.groups.map((d) => {
				const extra = readExtra(GroupExtra, d.extra);
				return {
					id: d.id,
					app,
					name: d.name,
					kind: extra?.kind ?? "group",
					clientIds: extra?.clientIds ?? [],
					active: d.active,
					createdAt: stamp(d._creationTime),
					updatedAt: stamp(d.updatedAt ?? d._creationTime),
				};
			});
		},
		async create(row) {
			const made = await call.mutate(
				"apiResources:createGroup",
				{ tenant: row.app, actor: actorArg(), slug: slugFor(row.name), name: row.name },
				{ id: z.string() },
			);
			await setExtra(call, row.app, "groupActivities", made.id, extraOf(row));
			if (!row.active)
				await call.mutate(
					"apiResources:updateGroup",
					{ tenant: row.app, actor: actorArg(), group: made.id, patch: { active: false } },
					{},
				);
			return { ...row, id: made.id };
		},
		async update(before, after) {
			if (before.name !== after.name || before.active !== after.active)
				await call.mutate(
					"apiResources:updateGroup",
					{
						tenant: after.app,
						actor: actorArg(),
						group: after.id,
						patch: { name: after.name, active: after.active },
					},
					{},
				);
			if (
				before.kind !== after.kind ||
				JSON.stringify(before.clientIds) !== JSON.stringify(after.clientIds)
			)
				await setExtra(call, after.app, "groupActivities", after.id, extraOf(after));
		},
		remove: (app, id) => removed(call, app, "groupActivities", id),
	});
}
