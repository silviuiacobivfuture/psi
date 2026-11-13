import { reaches } from "../authz/access";
import { appLink, ownerLink } from "../authz/links";
import type { HandlersOf } from "../http/context";
import { fail } from "../http/errors";
import type { DeviceRow, PersonRow, RoomRow, ServiceRow, StorePort } from "../store/types";
import { must, newId, paginate, stamps, writeTuples } from "./shared";

const page = <T, R>(
	rows: T[],
	q: { limit?: number | undefined; cursor?: string | undefined },
	map: (row: T) => R,
): { items: R[]; nextCursor?: string } => {
	const p = paginate(rows, q.limit, q.cursor);
	return { ...p, items: p.items.map(map) };
};
const byName = <T extends { name?: string; displayName?: string }>(a: T, b: T): number =>
	(a.name ?? a.displayName ?? "").localeCompare(b.name ?? b.displayName ?? "");

/**
 * Everything a catalogue row names must be something of the same app: a person's rooms and services, a room's own
 * practitioner, a service's practitioners, rooms and devices. Nothing is written when one is not.
 */
async function refsExist(
	store: StorePort,
	app: string,
	refs: {
		people?: ReadonlyArray<string> | undefined;
		rooms?: ReadonlyArray<string> | undefined;
		devices?: ReadonlyArray<string> | undefined;
		services?: ReadonlyArray<string> | undefined;
	},
): Promise<void> {
	const check = async (
		what: string,
		wanted: ReadonlyArray<string> | undefined,
		have: Promise<ReadonlyArray<{ id: string }>>,
	): Promise<void> => {
		if (wanted === undefined || wanted.length === 0) return;
		const ids = new Set((await have).map((r) => r.id));
		for (const id of wanted)
			if (!ids.has(id)) throw fail("invalid", `unknown ${what}`, { [what]: id });
	};
	await check("person", refs.people, store.c.people.list(app));
	await check("room", refs.rooms, store.c.rooms.list(app));
	await check("device", refs.devices, store.c.devices.list(app));
	await check("service", refs.services, store.c.services.list(app));
}

/** The fields of an object that were said (an absent one is not `undefined` on the wire). */
const said = <T extends object>(o: T): Partial<T> =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

const personOut = (p: PersonRow) => ({
	id: p.id,
	displayName: p.displayName,
	kind: p.kind,
	...(p.subject === undefined ? {} : { subject: p.subject }),
	active: p.active,
	external: p.external,
	...(p.color === undefined ? {} : { color: p.color }),
	...said({
		email: p.email,
		specialty: p.specialty,
		hours: p.hours,
		roomIds: p.roomIds,
		serviceIds: p.serviceIds,
	}),
	createdAt: p.createdAt,
	updatedAt: p.updatedAt,
});
const roomOut = (r: RoomRow) => ({
	id: r.id,
	name: r.name,
	kind: r.kind,
	...(r.capacity === undefined ? {} : { capacity: r.capacity }),
	...said({
		floor: r.floor,
		purpose: r.purpose,
		bookable: r.bookable,
		homePractitionerId: r.homePractitionerId,
	}),
	active: r.active,
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
});
const deviceOut = (d: DeviceRow) => ({
	id: d.id,
	name: d.name,
	...(d.roomId === undefined ? {} : { roomId: d.roomId }),
	...said({ deviceType: d.deviceType, bookable: d.bookable }),
	active: d.active,
	createdAt: d.createdAt,
	updatedAt: d.updatedAt,
});
const groupOut = (g: {
	id: string;
	name: string;
	kind: "group" | "atelier";
	clientIds: string[];
	active: boolean;
	createdAt: number;
	updatedAt: number;
}) => ({
	id: g.id,
	name: g.name,
	kind: g.kind,
	clientIds: g.clientIds,
	active: g.active,
	createdAt: g.createdAt,
	updatedAt: g.updatedAt,
});
/** The price group is absent, not null, unless the caller may see prices. */
const serviceOut = (s: ServiceRow, prices: boolean) => ({
	id: s.id,
	slug: s.slug,
	name: s.name,
	durationMinutes: s.durationMinutes,
	bufferMinutes: s.bufferMinutes,
	modes: s.modes,
	practitionerIds: s.practitionerIds,
	...said({
		category: s.category,
		roomCategory: s.roomCategory,
		roomIds: s.roomIds,
		deviceIds: s.deviceIds,
	}),
	active: s.active,
	...(prices && s.prices !== undefined ? { prices: s.prices } : {}),
	createdAt: s.createdAt,
	updatedAt: s.updatedAt,
});

export const catalogHandlers: HandlersOf<
	| "people.list"
	| "people.create"
	| "people.update"
	| "people.remove"
	| "rooms.list"
	| "rooms.create"
	| "rooms.update"
	| "rooms.remove"
	| "devices.list"
	| "devices.create"
	| "devices.update"
	| "devices.remove"
	| "groups.list"
	| "groups.create"
	| "groups.update"
	| "groups.remove"
	| "services.list"
	| "services.create"
	| "services.update"
	| "services.remove"
	| "services.setPrice"
> = {
	async "people.list"(ctx) {
		return page(
			(await ctx.deps.store.c.people.list(ctx.app))
				.filter((p) => reaches(ctx.reach, p.id))
				.sort(byName),
			ctx.query,
			personOut,
		);
	},
	async "people.create"(ctx) {
		await refsExist(ctx.deps.store, ctx.app, {
			rooms: ctx.body.roomIds,
			services: ctx.body.serviceIds,
		});
		const draft: PersonRow = {
			id: newId("p"),
			app: ctx.app,
			displayName: ctx.body.displayName,
			kind: ctx.body.kind,
			...(ctx.body.subject === undefined ? {} : { subject: ctx.body.subject }),
			active: true,
			external: ctx.body.external ?? false,
			...(ctx.body.color === undefined ? {} : { color: ctx.body.color }),
			...said({
				email: ctx.body.email,
				specialty: ctx.body.specialty,
				hours: ctx.body.hours,
				roomIds: ctx.body.roomIds,
				serviceIds: ctx.body.serviceIds,
			}),
			...stamps(ctx.now),
		};
		const row = await ctx.deps.store.c.people.insert(draft);
		await writeTuples(ctx, [
			appLink("sched_calendar", row.id, ctx.app),
			...(row.subject === undefined ? [] : [ownerLink(row.id, row.subject)]),
		]);
		return personOut(row);
	},
	async "people.update"(ctx) {
		const row = await must(ctx.deps.store.c.people, ctx.app, String(ctx.params.id), "person");
		await refsExist(ctx.deps.store, ctx.app, {
			rooms: ctx.body.roomIds,
			services: ctx.body.serviceIds,
		});
		const next: PersonRow = {
			...row,
			...Object.fromEntries(Object.entries(ctx.body).filter(([, v]) => v !== undefined)),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.people.replace(next);
		// The person's account is bound once, as the owner of their calendar: moving it moves every scope that hangs off it.
		if (next.subject !== row.subject)
			await writeTuples(
				ctx,
				next.subject === undefined ? [] : [ownerLink(row.id, next.subject)],
				row.subject === undefined ? [] : [ownerLink(row.id, row.subject)],
			);
		return personOut(next);
	},
	async "people.remove"(ctx) {
		const row = await must(ctx.deps.store.c.people, ctx.app, String(ctx.params.id), "person");
		const history = await ctx.deps.store.c.appointments.list(ctx.app, {
			eq: { practitionerId: row.id },
		});
		const treating = (await ctx.deps.store.c.clients.list(ctx.app)).some((c) =>
			c.treating.includes(row.id),
		);
		if (history.length > 0 || treating) {
			// A person with history is deactivated, never deleted: their calendar and their clients stay readable.
			await ctx.deps.store.c.people.replace({ ...row, active: false, updatedAt: ctx.now });
		} else {
			await ctx.deps.store.c.people.remove(ctx.app, row.id);
			await writeTuples(
				ctx,
				[],
				[
					appLink("sched_calendar", row.id, ctx.app),
					...(row.subject === undefined ? [] : [ownerLink(row.id, row.subject)]),
				],
			);
		}
		return { ok: true as const };
	},

	async "rooms.list"(ctx) {
		return page((await ctx.deps.store.c.rooms.list(ctx.app)).sort(byName), ctx.query, roomOut);
	},
	async "rooms.create"(ctx) {
		await refsExist(ctx.deps.store, ctx.app, {
			people: ctx.body.homePractitionerId === undefined ? [] : [ctx.body.homePractitionerId],
		});
		const draft = {
			id: newId("o"),
			app: ctx.app,
			name: ctx.body.name,
			kind: ctx.body.kind,
			...(ctx.body.capacity === undefined ? {} : { capacity: ctx.body.capacity }),
			...said({
				floor: ctx.body.floor,
				purpose: ctx.body.purpose,
				bookable: ctx.body.bookable,
				homePractitionerId: ctx.body.homePractitionerId,
			}),
			active: true,
			...stamps(ctx.now),
		};
		const row = await ctx.deps.store.c.rooms.insert(draft);
		await writeTuples(ctx, [appLink("sched_room", row.id, ctx.app)]);
		return roomOut(row);
	},
	async "rooms.update"(ctx) {
		const row = await must(ctx.deps.store.c.rooms, ctx.app, String(ctx.params.id), "room");
		await refsExist(ctx.deps.store, ctx.app, {
			people: ctx.body.homePractitionerId === undefined ? [] : [ctx.body.homePractitionerId],
		});
		const next = {
			...row,
			...Object.fromEntries(Object.entries(ctx.body).filter(([, v]) => v !== undefined)),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.rooms.replace(next);
		return roomOut(next);
	},
	async "rooms.remove"(ctx) {
		const row = await must(ctx.deps.store.c.rooms, ctx.app, String(ctx.params.id), "room");
		const used =
			(await ctx.deps.store.c.appointments.list(ctx.app, { eq: { roomId: row.id } })).length > 0;
		if (used) await ctx.deps.store.c.rooms.replace({ ...row, active: false, updatedAt: ctx.now });
		else {
			await ctx.deps.store.c.rooms.remove(ctx.app, row.id);
			await writeTuples(ctx, [], [appLink("sched_room", row.id, ctx.app)]);
		}
		return { ok: true as const };
	},

	async "devices.list"(ctx) {
		return page((await ctx.deps.store.c.devices.list(ctx.app)).sort(byName), ctx.query, deviceOut);
	},
	async "devices.create"(ctx) {
		if (ctx.body.roomId !== undefined)
			await must(ctx.deps.store.c.rooms, ctx.app, ctx.body.roomId, "room");
		const draft = {
			id: newId("d"),
			app: ctx.app,
			name: ctx.body.name,
			...(ctx.body.roomId === undefined ? {} : { roomId: ctx.body.roomId }),
			...said({ deviceType: ctx.body.deviceType, bookable: ctx.body.bookable }),
			active: true,
			...stamps(ctx.now),
		};
		const row = await ctx.deps.store.c.devices.insert(draft);
		await writeTuples(ctx, [appLink("sched_device", row.id, ctx.app)]);
		return deviceOut(row);
	},
	async "devices.update"(ctx) {
		const row = await must(ctx.deps.store.c.devices, ctx.app, String(ctx.params.id), "device");
		if (ctx.body.roomId !== undefined)
			await must(ctx.deps.store.c.rooms, ctx.app, ctx.body.roomId, "room");
		const next = {
			...row,
			...Object.fromEntries(Object.entries(ctx.body).filter(([, v]) => v !== undefined)),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.devices.replace(next);
		return deviceOut(next);
	},
	async "devices.remove"(ctx) {
		const row = await must(ctx.deps.store.c.devices, ctx.app, String(ctx.params.id), "device");
		const used =
			(await ctx.deps.store.c.appointments.list(ctx.app, { eq: { deviceId: row.id } })).length > 0;
		if (used) await ctx.deps.store.c.devices.replace({ ...row, active: false, updatedAt: ctx.now });
		else {
			await ctx.deps.store.c.devices.remove(ctx.app, row.id);
			await writeTuples(ctx, [], [appLink("sched_device", row.id, ctx.app)]);
		}
		return { ok: true as const };
	},

	async "groups.list"(ctx) {
		return page((await ctx.deps.store.c.groups.list(ctx.app)).sort(byName), ctx.query, groupOut);
	},
	async "groups.create"(ctx) {
		const draft = {
			id: newId("g"),
			app: ctx.app,
			name: ctx.body.name,
			kind: ctx.body.kind,
			clientIds: ctx.body.clientIds ?? [],
			active: true,
			...stamps(ctx.now),
		};
		const row = await ctx.deps.store.c.groups.insert(draft);
		return groupOut(row);
	},
	async "groups.update"(ctx) {
		const row = await must(ctx.deps.store.c.groups, ctx.app, String(ctx.params.id), "group");
		const next = {
			...row,
			...Object.fromEntries(Object.entries(ctx.body).filter(([, v]) => v !== undefined)),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.groups.replace(next);
		return groupOut(next);
	},
	async "groups.remove"(ctx) {
		const row = await must(ctx.deps.store.c.groups, ctx.app, String(ctx.params.id), "group");
		const used =
			(await ctx.deps.store.c.appointments.list(ctx.app, { eq: { groupId: row.id } })).length > 0;
		if (used) await ctx.deps.store.c.groups.replace({ ...row, active: false, updatedAt: ctx.now });
		else await ctx.deps.store.c.groups.remove(ctx.app, row.id);
		return { ok: true as const };
	},

	async "services.list"(ctx) {
		const prices = await ctx.canAll("prices_view");
		return page(
			(await ctx.deps.store.c.services.list(ctx.app)).sort((a, b) => a.slug.localeCompare(b.slug)),
			ctx.query,
			(s) => serviceOut(s, prices),
		);
	},
	async "services.create"(ctx) {
		if ((await ctx.deps.store.c.services.list(ctx.app)).some((s) => s.slug === ctx.body.slug))
			throw fail("conflict", "the slug is taken");
		const people = await ctx.deps.store.c.people.list(ctx.app);
		for (const id of ctx.body.practitionerIds)
			if (!people.some((p) => p.id === id)) throw fail("invalid", "unknown person", { person: id });
		await refsExist(ctx.deps.store, ctx.app, {
			rooms: ctx.body.roomIds,
			devices: ctx.body.deviceIds,
		});
		const draft: ServiceRow = {
			id: newId("s"),
			app: ctx.app,
			slug: ctx.body.slug,
			name: ctx.body.name,
			durationMinutes: ctx.body.durationMinutes,
			bufferMinutes: ctx.body.bufferMinutes,
			modes: ctx.body.modes,
			practitionerIds: ctx.body.practitionerIds,
			...said({
				category: ctx.body.category,
				roomCategory: ctx.body.roomCategory,
				roomIds: ctx.body.roomIds,
				deviceIds: ctx.body.deviceIds,
			}),
			active: true,
			...stamps(ctx.now),
		};
		const row = await ctx.deps.store.c.services.insert(draft);
		return serviceOut(row, false);
	},
	async "services.update"(ctx) {
		const row = await must(ctx.deps.store.c.services, ctx.app, String(ctx.params.id), "service");
		await refsExist(ctx.deps.store, ctx.app, {
			people: ctx.body.practitionerIds,
			rooms: ctx.body.roomIds,
			devices: ctx.body.deviceIds,
		});
		const next: ServiceRow = {
			...row,
			...Object.fromEntries(Object.entries(ctx.body).filter(([, v]) => v !== undefined)),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.services.replace(next);
		return serviceOut(next, await ctx.canAll("prices_view"));
	},
	async "services.remove"(ctx) {
		const row = await must(ctx.deps.store.c.services, ctx.app, String(ctx.params.id), "service");
		const used =
			(await ctx.deps.store.c.appointments.list(ctx.app, { eq: { serviceId: row.id } })).length > 0;
		if (used)
			await ctx.deps.store.c.services.replace({ ...row, active: false, updatedAt: ctx.now });
		else await ctx.deps.store.c.services.remove(ctx.app, row.id);
		return { ok: true as const };
	},
	async "services.setPrice"(ctx) {
		const row = await must(ctx.deps.store.c.services, ctx.app, String(ctx.params.id), "service");
		const next: ServiceRow = {
			...row,
			prices: { priceCents: ctx.body.priceCents, currency: ctx.body.currency },
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.services.replace(next);
		return serviceOut(next, await ctx.canAll("prices_view"));
	},
};
