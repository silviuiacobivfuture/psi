import { MAX_IDS } from "@psi/scheduling-sdk/contract";
import { addDays } from "../../lib/dates";
import type { CalendarData, CalendarFocus, DayCount, ReminderItem } from "../port";
import type { Appointment, AppSlug, Client, Column, RosterEntry, SearchHit } from "../schema";
import { appointmentDefaults } from "../schema";
import { readCalendar } from "./calendar-read";
import type { SdkContext } from "./context";
import { toPortError } from "./errors";
import { appointmentOf, clientOf, column, drain, rosterOf, serviceOf } from "./map";
import { instantOf, wallOf } from "./time";

/** How many clients a search shows. */
const SEARCH_HITS = 6;

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
			...rooms
				.filter((r) => r.active)
				.map((r, i) => column("room", r.id, r.name, i + 4, r.capacity)),
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

	/** These clients, whatever their standing, in batches of MAX_IDS: one call per hundred clients, not one per client. */
	async function clientsByIds(app: AppSlug, ids: ReadonlyArray<string>): Promise<Client[]> {
		const batches: string[][] = [];
		for (let at = 0; at < ids.length; at += MAX_IDS) batches.push(ids.slice(at, at + MAX_IDS));
		const pages = await Promise.all(
			batches.map((batch) => api.clients.list({ app, ids: batch.join(","), limit: MAX_IDS })),
		);
		return pages.flatMap((p) => p.items.map(clientOf));
	}

	return {
		columns: (app: AppSlug): Promise<Column[]> => run(() => columns(app)),
		services: (app: AppSlug) => run(() => services(app)),
		clientsPage,
		clientsByIds: (app: AppSlug, ids: ReadonlyArray<string>): Promise<Client[]> =>
			run(() => clientsByIds(app, ids)),

		calendarSummary: (app: AppSlug, from: string, to: string): Promise<DayCount[]> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const got = await api.calendar.summary({
					app,
					from: instantOf(from, 0, tz),
					to: instantOf(addDays(to, 1), 0, tz),
				});
				return got.days;
			}),

		calendar: (
			app: AppSlug,
			from: string,
			to: string,
			focus?: CalendarFocus,
		): Promise<CalendarData> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const read = await readCalendar(api, app, tz, from, to, focus);
				// The sheet that creates an appointment needs clients and services; the grid does not. A person who may
				// not list them still sees the calendar.
				const soft = async <T>(list: Promise<T[]>): Promise<T[]> =>
					list.catch((error: unknown) => {
						if (toPortError(error).code === "forbidden") return [];
						throw error;
					});
				const columns = read.columns.map((c, i) => column("person", c.id, c.name, i));
				// The service's calendars are people: a filter that does not show the one drawn shows none of them.
				const drawn = columns.find((c) => c.id === read.only);
				const hidden = drawn !== undefined && focus?.show !== undefined && !focus.show(drawn);
				const appointments = hidden
					? []
					: [...read.visits.values()].flatMap((list) => list.map((a) => appointmentOf(a, tz)));
				// The tiles name their clients: only the clients of the visits shown, in batches, never the whole list.
				const named = [
					...new Set(appointments.flatMap((a) => (a.clientId === null ? [] : [a.clientId]))),
				];
				const [svc, clients] = await Promise.all([
					soft(services(app)),
					soft(clientsByIds(app, named)),
				]);
				return {
					columns,
					appointments,
					clients,
					services: svc,
				};
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
				// Six hits are shown: six are asked for, never every client the text matches.
				const [tz, first] = await Promise.all([
					sdk.zone(app),
					api.clients.list({ app, status: "active", q, limit: SEARCH_HITS }),
				]);
				const clients = first.items.map(clientOf);
				const hits: SearchHit[] = clients.map((c) => ({
					kind: "client",
					id: c.id,
					label: c.name,
					detail: c.phone ?? "",
				}));
				const now = Date.now();
				const visits = await Promise.all(
					clients.slice(0, 3).map((c) =>
						api.appointments.list({
							app,
							clientId: c.id,
							from: now - 30 * 86_400_000,
							to: now + 90 * 86_400_000,
							limit: 3,
						}),
					),
				);
				clients.slice(0, 3).forEach((c, i) => {
					for (const a of visits[i]?.items ?? []) {
						const date = wallOf(a.start, tz).date;
						hits.push({ kind: "appointment", id: a.id, label: c.name, detail: date, date });
					}
				});
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
								...appointmentDefaults(),
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
