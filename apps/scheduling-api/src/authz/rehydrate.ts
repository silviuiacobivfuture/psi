import type { StorePort } from "../store/types";
import { appLink, ownerLink, parentLink, treatingLink } from "./links";
import type { Tuple } from "./port";

/**
 * The tuples that tie every object the store holds to its app and its people: what the handlers write one by one as
 * rows are created. A service whose authorization tuples live in memory (the local run) writes them again from the
 * store when it starts; a clinic that came in through an import has no other way to get them.
 */
export async function objectLinks(store: StorePort, app: string): Promise<Tuple[]> {
	const c = store.c;
	const [people, rooms, devices, clients, appointments, packages, records, files] =
		await Promise.all([
			c.people.list(app),
			c.rooms.list(app),
			c.devices.list(app),
			c.clients.list(app),
			c.appointments.list(app),
			c.packages.list(app),
			c.records.list(app),
			c.files.list(app),
		]);
	return [
		...people.flatMap((p) => [
			appLink("sched_calendar", p.id, app),
			...(p.subject === undefined ? [] : [ownerLink(p.id, p.subject)]),
		]),
		...rooms.map((r) => appLink("sched_room", r.id, app)),
		...devices.map((d) => appLink("sched_device", d.id, app)),
		...clients.flatMap((x) => [
			appLink("sched_client", x.id, app),
			...x.treating.map((p) => treatingLink(x.id, p)),
		]),
		...appointments.flatMap((a) => [
			appLink("sched_appointment", a.id, app),
			parentLink("sched_appointment", a.id, "calendar", "sched_calendar", a.practitionerId),
		]),
		...packages.flatMap((p) => [
			appLink("sched_package", p.id, app),
			parentLink("sched_package", p.id, "client", "sched_client", p.clientId),
		]),
		...records.flatMap((r) =>
			r.clientId === undefined
				? [appLink("sched_record", r.id, app)]
				: [
						appLink("sched_record", r.id, app),
						parentLink("sched_record", r.id, "client", "sched_client", r.clientId),
					],
		),
		...files.flatMap((f) =>
			f.clientId === undefined
				? [appLink("sched_file", f.id, app)]
				: [
						appLink("sched_file", f.id, app),
						parentLink("sched_file", f.id, "client", "sched_client", f.clientId),
					],
		),
	];
}
