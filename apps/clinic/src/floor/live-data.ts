import type { LiveBooking, LiveData, LiveSource, StoreRoomInfo } from "@psi/ui/admin/floor-plan";
import type { Ctx } from "../lib/context";
import { PortError } from "../port/port";
import type { Appointment, Column, Service } from "../port/schema";
import { instantOf, wallOf } from "../port/sdk/time";

const ROOM_KINDS: ReadonlySet<Column["kind"]> = new Set(["room", "group"]);

/** The rooms (and group rooms) the clinic has; a list the person may not read is simply empty. */
async function columnsOf(ctx: Ctx): Promise<ReadonlyArray<Column>> {
	try {
		return await ctx.port.columns(ctx.app);
	} catch (error) {
		if (error instanceof PortError && error.code === "forbidden") return [];
		throw error;
	}
}

export async function roomsOf(ctx: Ctx): Promise<StoreRoomInfo[]> {
	return (await columnsOf(ctx))
		.filter((c) => ROOM_KINDS.has(c.kind))
		.map((c) => ({ id: c.id, name: c.name, capacity: c.capacity ?? 1 }));
}

export async function devicesOf(ctx: Ctx): Promise<Array<{ id: string; name: string }>> {
	return (await columnsOf(ctx))
		.filter((c) => c.kind === "device")
		.map((c) => ({ id: c.id, name: c.name }));
}

const initials = (name: string, max: number): string =>
	name
		.split(/\s+/)
		.filter((w) => w !== "")
		.slice(0, max)
		.map((w) => w.slice(0, 1).toLocaleUpperCase())
		.join("") || "·";

function statusOf(a: Appointment): LiveBooking["status"] | null {
	switch (a.status) {
		case "confirmed":
		case "attended":
		case "no-show":
			return "confirmed";
		case "requested":
			return "requested";
		case "cancelled":
			return "cancelled";
		case "leave":
		case "medical-leave":
			return null;
		default: {
			const never: never = a.status;
			return never;
		}
	}
}

/** Bookings of the rooms between two instants, from the calendar the console already shows. */
export async function liveData(
	ctx: Ctx,
	range: { from: number; until: number },
): Promise<LiveData> {
	const tz = ctx.caps.timeZone;
	const from = wallOf(range.from, tz).date;
	const to = wallOf(range.until - 1, tz).date;
	const [columns, calendar] = await Promise.all([
		columnsOf(ctx),
		ctx.port.calendar(ctx.app, from, to),
	]);
	const all = new Map<string, Column>();
	for (const c of [...columns, ...calendar.columns]) all.set(c.id, c);
	const rooms = [...all.values()].filter((c) => ROOM_KINDS.has(c.kind));
	const roomIds = new Set(rooms.map((r) => r.id));
	const deviceIds = new Set([...all.values()].filter((c) => c.kind === "device").map((c) => c.id));
	const services = new Map<string, Service>(calendar.services.map((s) => [s.id, s]));
	const clients = new Map(calendar.clients.map((c) => [c.id, c]));
	const seeClients = ctx.can.has("clients_view");
	const bookings: LiveBooking[] = [];
	for (const a of calendar.appointments) {
		const status = statusOf(a);
		if (status === null) continue;
		const placed = [a.columnId, ...a.resourceIds].filter((id) => roomIds.has(id));
		if (placed.length === 0) continue;
		const who = all.get(a.columnId);
		const start = instantOf(a.date, a.startMin, tz);
		const client = a.clientId === null ? undefined : clients.get(a.clientId);
		for (const roomId of placed) {
			bookings.push({
				id: `${a.id}-${roomId}`.slice(0, 64),
				roomId,
				start,
				until: start + a.durationMin * 60_000,
				status,
				practitioner:
					who?.kind === "person"
						? { name: who.name.slice(0, 80), monogram: initials(who.name, 2) }
						: { name: "", monogram: "·" },
				service: (services.get(a.serviceId)?.name ?? a.title ?? "").slice(0, 80),
				people: 1,
				shared: all.get(roomId)?.kind === "group",
				...(seeClients && client !== undefined
					? { clientInitials: [initials(client.name, 2)] }
					: {}),
				deviceIds: a.resourceIds.filter((id) => deviceIds.has(id)),
			});
		}
	}
	return {
		rooms: rooms.map((r) => ({
			id: r.id,
			name: r.name.slice(0, 80),
			kind: r.kind,
			capacity: r.capacity ?? 1,
			equipment: [],
			closures: [],
		})),
		bookings,
		devices: [...all.values()]
			.filter((c) => c.kind === "device")
			.map((d) => ({ id: d.id, name: d.name.slice(0, 80) })),
	};
}

/** The live view's source: the calendar of the rooms, and the port's live feed as the "something changed" signal. */
export function liveSource(ctx: Ctx): LiveSource {
	return {
		load: (range) => liveData(ctx, range),
		subscribe: (listener) => {
			const stop = new AbortController();
			void (async () => {
				try {
					for await (const signal of ctx.port.live(ctx.app, stop.signal))
						if (signal.stream === "calendar") listener();
				} catch {
					// The feed ended (the page asks again on its own when the person comes back).
				}
			})();
			return () => stop.abort();
		},
	};
}
