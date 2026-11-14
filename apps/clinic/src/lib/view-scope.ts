import type { Capabilities, ClinicPort } from "../port/port";

/** The people whose rows a permission reaches, or null when it reaches everyone's. */
function reachSet(caps: Capabilities, key: string): ReadonlySet<string> | null {
	const scopes = caps.permissions[key] ?? [];
	// "all" is everything (an empty list is a permission not held).
	if (scopes.length === 0 || scopes.includes("all")) return null;
	return new Set([
		...(scopes.includes("own") ? caps.reach.own : []),
		...(scopes.includes("assigned") ? caps.reach.assigned : []),
	]);
}

/**
 * While looking at the app as a role or member, the data still comes from the administrator's own reach. A narrowed
 * scope (their own, the people they coordinate) is applied here to what the screens show, so the view matches what
 * that role or member really sees: a therapist's calendar is their own column, not the clinic's.
 */
export function scopedPort(port: ClinicPort, caps: Capabilities): ClinicPort {
	const calendar = reachSet(caps, "calendars_view");
	const clients = reachSet(caps, "clients_view");
	const appointments = reachSet(caps, "appointments_view");
	return {
		...port,
		async calendar(app, from, to) {
			const data = await port.calendar(app, from, to);
			if (calendar === null) return data;
			return {
				...data,
				columns: data.columns.filter((c) => calendar.has(c.id)),
				appointments: data.appointments.filter((a) => calendar.has(a.columnId)),
			};
		},
		async clients(app, filter, query) {
			const all = await port.clients(app, filter, query);
			return clients === null
				? all
				: all.filter((c) => c.practitionerId !== null && clients.has(c.practitionerId));
		},
		async clientsByIds(app, ids) {
			const all = await port.clientsByIds(app, ids);
			return clients === null
				? all
				: all.filter((c) => c.practitionerId !== null && clients.has(c.practitionerId));
		},
		async clientPage(app, filter, query, cursor) {
			const page = await port.clientPage(app, filter, query, cursor);
			if (clients === null) return page;
			const shown = page.clients.filter(
				(c) => c.practitionerId !== null && clients.has(c.practitionerId),
			);
			const ids = new Set(shown.map((c) => c.id));
			return {
				...page,
				clients: shown,
				summaries: page.summaries.filter((s) => ids.has(s.clientId)),
			};
		},
		async client(app, id) {
			const found = await port.client(app, id);
			if (found === null || clients === null) return found;
			return found.practitionerId !== null && clients.has(found.practitionerId) ? found : null;
		},
		async clientAppointments(app, id) {
			const found = await this.client(app, id);
			if (found === null) return [];
			const all = await port.clientAppointments(app, id);
			return appointments === null ? all : all.filter((a) => appointments.has(a.columnId));
		},
		async search(app, query) {
			const hits = await port.search(app, query);
			if (clients === null) return hits;
			// Appointment hits come from the clients the query matched; outside the reach, neither is shown.
			const allowed = new Set((await this.clients(app, "current", "")).map((c) => c.id));
			return hits.filter((h) => h.kind === "client" && allowed.has(h.id));
		},
	};
}
