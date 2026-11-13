import { addDays } from "../../lib/dates";
import { type CalendarData, PortError, type ReminderItem } from "../port";
import type {
	Appointment,
	AppSlug,
	Client,
	Column,
	NewAppointment,
	RosterEntry,
	SearchHit,
} from "../schema";
import type { SdkContext } from "./context";
import { toPortError } from "./errors";
import { appointmentOf, clientOf, column, drain, rosterOf, serviceOf } from "./map";
import { instantOf, wallOf } from "./time";

/** The calendar, appointments, search, reminders and the roster. */
export function calendarGroup(sdk: SdkContext) {
	const { api, run } = sdk;

	async function columns(app: AppSlug): Promise<Column[]> {
		const tolerate = async <T>(list: () => Promise<T[]>): Promise<T[]> => {
			try {
				return await list();
			} catch (error) {
				// A kind the person may not list is simply not among the columns.
				const refusal = toPortError(error);
				if (refusal.code === "forbidden") return [];
				throw refusal;
			}
		};
		const page = <T>(
			f: (input: {
				app: string;
				limit: number;
				cursor?: string;
			}) => Promise<{ items: T[]; nextCursor?: string | undefined }>,
		) => drain<T>((cursor) => f({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }));
		const [people, rooms, devices, groups] = await Promise.all([
			tolerate(() => page((i) => api.people.list(i))),
			tolerate(() => page((i) => api.rooms.list(i))),
			tolerate(() => page((i) => api.devices.list(i))),
			tolerate(() => page((i) => api.groups.list(i))),
		]);
		return [
			...people.filter((p) => p.active).map((p, i) => column("person", p.id, p.displayName, i)),
			...rooms.filter((r) => r.active).map((r, i) => column("room", r.id, r.name, i + 4)),
			...devices.filter((d) => d.active).map((d, i) => column("device", d.id, d.name, i + 3)),
			...groups.filter((g) => g.active).map((g, i) => column("group", g.id, g.name, i + 5)),
		];
	}

	async function services(app: AppSlug) {
		const all = await drain((cursor) =>
			api.services.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
		);
		return all.filter((s) => s.active).map(serviceOf);
	}

	async function clientsPage(
		app: AppSlug,
		status: "active" | "archived",
		q: string,
	): Promise<Client[]> {
		const all = await drain((cursor) =>
			api.clients.list({
				app,
				status,
				...(q === "" ? {} : { q }),
				limit: 500,
				...(cursor === undefined ? {} : { cursor }),
			}),
		);
		return all.map(clientOf);
	}

	return {
		columns: (app: AppSlug): Promise<Column[]> => run(() => columns(app)),
		services: (app: AppSlug) => run(() => services(app)),
		clientsPage,

		calendar: (app: AppSlug, from: string, to: string): Promise<CalendarData> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const result = await api.calendar.get({
					app,
					from: instantOf(from, 0, tz),
					to: instantOf(addDays(to, 1), 0, tz),
					columns: "person",
				});
				// The sheet that creates an appointment needs clients and services; the grid does not. A person who may
				// not list them still sees the calendar.
				const soft = async <T>(list: Promise<T[]>): Promise<T[]> =>
					list.catch((error: unknown) => {
						if (toPortError(error).code === "forbidden") return [];
						throw error;
					});
				// Clients are listed (and their clinical data opened and audited by the service) only for someone who can
				// create an appointment with them.
				const me = await sdk.me(app);
				const [svc, clients] = await Promise.all([
					soft(services(app)),
					Object.hasOwn(me.permissions, "appointments_create")
						? soft(clientsPage(app, "active", ""))
						: Promise.resolve([]),
				]);
				return {
					columns: result.columns.map((c, i) => column("person", c.id, c.name, i)),
					appointments: result.columns.flatMap((c) =>
						c.appointments.map((a) => appointmentOf(a, tz)),
					),
					clients,
					services: svc,
				};
			}),

		createAppointment: (app: AppSlug, input: NewAppointment): Promise<Appointment> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const service = (await services(app)).find((s) => s.id === input.serviceId);
				if (service === undefined) throw new PortError("invalid", "unknown service");
				const start = instantOf(input.date, input.startMin, tz);
				const made = await api.appointments.create({
					app,
					kind: "session",
					practitionerId: input.columnId,
					clientId: input.clientId,
					serviceId: input.serviceId,
					start,
					end: start + service.durationMin * 60_000,
				});
				return appointmentOf(made, tz);
			}),

		clientAppointments: (app: AppSlug, id: string): Promise<Appointment[]> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const all = await drain((cursor) =>
					api.appointments.list({
						app,
						clientId: id,
						from: 0,
						to: Date.UTC(2100, 0, 1),
						limit: 500,
						...(cursor === undefined ? {} : { cursor }),
					}),
				);
				return all
					.map((a) => appointmentOf(a, tz))
					.sort((a, b) => (a.date + a.startMin).localeCompare(b.date + b.startMin));
			}),

		search: (app: AppSlug, query: string): Promise<SearchHit[]> =>
			run(async () => {
				const q = query.trim();
				if (q === "") return [];
				const tz = await sdk.zone(app);
				const clients = (await clientsPage(app, "active", q)).slice(0, 6);
				const hits: SearchHit[] = clients.map((c) => ({
					kind: "client",
					id: c.id,
					label: c.name,
					detail: c.phone ?? "",
				}));
				const now = Date.now();
				for (const c of clients.slice(0, 3)) {
					const appts = await api.appointments.list({
						app,
						clientId: c.id,
						from: now - 30 * 86_400_000,
						to: now + 90 * 86_400_000,
						limit: 3,
					});
					for (const a of appts.items) {
						const date = wallOf(a.start, tz).date;
						hits.push({ kind: "appointment", id: a.id, label: c.name, detail: date, date });
					}
				}
				return hits;
			}),

		roster: (
			app: AppSlug,
			weekStart: string,
		): Promise<{ people: Column[]; entries: RosterEntry[] }> =>
			run(async () => {
				const [all, got] = await Promise.all([
					columns(app),
					api.roster.get({ app, from: weekStart, to: addDays(weekStart, 6) }),
				]);
				return {
					people: all.filter((c) => c.kind === "person"),
					entries: got.items.map(rosterOf),
				};
			}),

		reminders: (app: AppSlug, date: string): Promise<ReminderItem[]> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const [due, day] = await Promise.all([
					api.reminders.list({ app, date }),
					// The reminders list does not need the calendar: a person who may not see it still sees their reminders.
					api.calendar
						.get({
							app,
							from: instantOf(date, 0, tz),
							to: instantOf(addDays(date, 1), 0, tz),
							columns: "person",
						})
						.catch(() => ({ columns: [] })),
				]);
				const placed = new Map<string, { appointment: Appointment; column: Column }>();
				day.columns.forEach((c, i) => {
					for (const a of c.appointments)
						placed.set(a.id, {
							appointment: appointmentOf(a, tz),
							column: column("person", c.id, c.name, i),
						});
				});
				return due.items
					.map((r): ReminderItem => {
						const found = placed.get(r.appointmentId);
						const start = wallOf(r.start, tz);
						return {
							appointment: found?.appointment ?? {
								id: r.appointmentId,
								date: start.date,
								startMin: start.minutes,
								durationMin: 60,
								columnId: "",
								clientId: r.clientId ?? null,
								title: null,
								serviceId: "",
								status: "confirmed",
								note: "",
							},
							client: {
								id: r.clientId ?? "",
								name: r.clientName ?? "",
								guardian: null,
								phone: r.contact?.phone ?? null,
								email: r.contact?.email ?? null,
								status: "current",
								note: "",
								practitionerId: null,
							},
							column: found?.column ?? column("person", "", "", 0),
							sent: r.state !== "pending",
						};
					})
					.sort((a, b) => a.appointment.startMin - b.appointment.startMin);
			}),

		markReminderSent: (app: AppSlug, appointmentId: string): Promise<void> =>
			run(async () => {
				await api.reminders.mark({ app, appointmentId, state: "sent" });
			}),
	};
}
