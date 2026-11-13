import type { AppointmentFacts, CalendarEvent, ReminderActions } from "@psi/notify/reminders";
import type { StorePort } from "./store/types";

/**
 * What the signed reminder links do to the calendar: confirm sets the reminder to confirmed, cancel cancels the
 * appointment (the slot is free again), and the calendar link reads it. The link proved who may; nothing here asks
 * OpenFGA. A link that names an appointment that is gone, past or deleted is `gone`; one already answered is `already`.
 */
export function createReminderActions(
	store: StorePort,
	clock: () => number,
	place: (app: string) => string,
): ReminderActions {
	async function live(app: string, id: string) {
		const row = await store.c.appointments.get(app, id);
		return row === undefined || row.deletedAt !== undefined || row.end <= clock() ? undefined : row;
	}

	async function facts(app: string, id: string): Promise<AppointmentFacts | undefined> {
		const row = await store.c.appointments.get(app, id);
		if (row === undefined) return undefined;
		const [who, service, person] = await Promise.all([
			row.clientId === undefined ? undefined : store.c.clients.get(app, row.clientId),
			row.serviceId === undefined ? undefined : store.c.services.get(app, row.serviceId),
			store.c.people.get(app, row.practitionerId),
		]);
		return {
			appointmentId: row.id,
			clientName: who?.name ?? "—",
			serviceName: service?.name.ro ?? "Programare",
			startsAt: new Date(row.start).toISOString(),
			...(person === undefined ? {} : { practitionerName: person.displayName }),
		};
	}

	return {
		async confirm(app, id) {
			const row = await live(app, id);
			if (row === undefined || row.status === "cancelled") return { status: "gone" };
			const held = await store.c.reminders.get(app, id);
			if (held?.state === "confirmed") return { status: "already" };
			const next = { id, app, state: "confirmed" as const, updatedAt: clock() };
			if (held === undefined) await store.c.reminders.insert(next);
			else await store.c.reminders.replace(next);
			await store.changes.append(app, { kind: "appointment", op: "updated", id });
			const appointment = await facts(app, id);
			return appointment === undefined ? { status: "gone" } : { status: "done", appointment };
		},

		async cancel(app, id) {
			const row = await live(app, id);
			if (row === undefined) return { status: "gone" };
			if (row.status === "cancelled") return { status: "already" };
			await store.c.appointments.replace({
				...row,
				status: "cancelled",
				cancelReason: "Anulat de client din link",
				updatedAt: clock(),
			});
			await store.changes.append(app, { kind: "appointment", op: "updated", id });
			const appointment = await facts(app, id);
			return appointment === undefined ? { status: "gone" } : { status: "done", appointment };
		},

		async calendar(app, id): Promise<CalendarEvent | undefined> {
			const row = await store.c.appointments.get(app, id);
			if (row === undefined || row.deletedAt !== undefined) return undefined;
			const appointment = await facts(app, id);
			return {
				summary: appointment?.serviceName ?? "Programare",
				startsAt: row.start,
				endsAt: row.end,
				location: place(app),
				cancelled: row.status === "cancelled",
			};
		},
	};
}
