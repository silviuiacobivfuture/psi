import { packageUsage } from "../domain/usage";
import { addDays, todayIso } from "../lib/dates";
import {
	type CalendarData,
	type ClientFilter,
	type ClinicPort,
	PortError,
	type ReminderItem,
} from "./port";
import type {
	Appointment,
	AppSlug,
	AuditEvent,
	Membership,
	Package,
	PushPrefs,
	SearchHit,
} from "./schema";
import type { AppData } from "./seed";
import { seedApp } from "./seed";

export interface FakeOptions {
	today?: string;
	/** subject → apps (and role names) they belong to. */
	members: Readonly<Record<string, ReadonlyArray<Membership>>>;
	/** Methods that fail with `unavailable`, to show the error states. */
	failing?: ReadonlySet<keyof ClinicPort>;
	/** Start with no clients, appointments, packages, requests or audit events (the empty states). */
	empty?: boolean;
}

/** The in-memory clinic: synthetic data, real behaviour for every call, until the scheduling SDK replaces it. */
export function createFakePort(opts: FakeOptions): ClinicPort {
	const today = opts.today ?? todayIso();
	const apps = new Map<AppSlug, AppData>();
	const data = (app: AppSlug): AppData => {
		let d = apps.get(app);
		if (d === undefined) {
			d = seedApp(app, today);
			if (opts.empty === true)
				d = {
					...d,
					clients: [],
					appointments: [],
					packages: [],
					requests: [],
					audit: [],
					roster: [],
				};
			apps.set(app, d);
		}
		return d;
	};
	const prefs = new Map<string, PushPrefs>();
	let seq = 1000;
	const guard = (method: keyof ClinicPort): void => {
		if (opts.failing?.has(method) === true)
			throw new PortError("unavailable", `${method} is unavailable`);
	};
	const log = (d: AppData, actor: string, action: string, target: string): void => {
		const e: AuditEvent = {
			id: `e${++seq}`,
			at: new Date().toISOString().slice(0, 19),
			actor,
			action,
			target,
		};
		d.audit.unshift(e);
	};
	const clientLabel = (d: AppData, id: string | null): string =>
		d.clients.find((c) => c.id === id)?.name ?? "";

	return {
		async memberships(subject) {
			guard("memberships");
			return opts.members[subject] ?? [];
		},
		async calendar(app, from, to): Promise<CalendarData> {
			guard("calendar");
			const d = data(app);
			return {
				columns: d.columns,
				services: d.services,
				clients: d.clients,
				appointments: d.appointments.filter((a) => a.date >= from && a.date <= to),
			};
		},
		async createAppointment(app, input) {
			guard("createAppointment");
			const d = data(app);
			const svc = d.services.find((s) => s.id === input.serviceId);
			if (
				svc === undefined ||
				!d.columns.some((c) => c.id === input.columnId) ||
				!d.clients.some((c) => c.id === input.clientId)
			)
				throw new PortError("invalid", "unknown service, column or client");
			const a: Appointment = {
				id: `a${++seq}`,
				date: input.date,
				startMin: input.startMin,
				durationMin: svc.durationMin,
				columnId: input.columnId,
				clientId: input.clientId,
				title: null,
				serviceId: svc.id,
				status: "confirmed",
				note: "",
				packageId: null,
			};
			d.appointments.push(a);
			log(d, "console", "appointment.create", a.id);
			return a;
		},
		async search(app, query): Promise<ReadonlyArray<SearchHit>> {
			guard("search");
			const q = query.trim().toLocaleLowerCase();
			if (q === "") return [];
			const d = data(app);
			const clients: SearchHit[] = d.clients
				.filter(
					(c) =>
						c.name.toLocaleLowerCase().includes(q) ||
						(c.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")),
				)
				.slice(0, 6)
				.map((c) => ({
					kind: "client",
					id: c.id,
					label: c.name,
					detail: c.phone ?? "",
				}));
			const appts: SearchHit[] = d.appointments
				.filter(
					(a) =>
						clientLabel(d, a.clientId).toLocaleLowerCase().includes(q) ||
						(a.title ?? "").toLocaleLowerCase().includes(q),
				)
				.slice(0, 6)
				.map((a) => ({
					kind: "appointment",
					id: a.id,
					label: a.title ?? clientLabel(d, a.clientId),
					detail: a.date,
					date: a.date,
				}));
			return [...clients, ...appts];
		},
		async clients(app, filter: ClientFilter, query) {
			guard("clients");
			const q = query.trim().toLocaleLowerCase();
			return data(app).clients.filter(
				(c) =>
					(filter === "current" ? c.status === "current" : c.status === "archived") &&
					(q === "" || c.name.toLocaleLowerCase().includes(q)),
			);
		},
		async client(app, id) {
			guard("client");
			return data(app).clients.find((c) => c.id === id) ?? null;
		},
		async clientAppointments(app, id) {
			guard("clientAppointments");
			return data(app)
				.appointments.filter((a) => a.clientId === id)
				.sort((a, b) => (a.date + a.startMin).localeCompare(b.date + b.startMin));
		},
		async archiveClient(app, id) {
			guard("archiveClient");
			const d = data(app);
			const c = d.clients.find((x) => x.id === id);
			if (c === undefined) throw new PortError("not-found", id);
			c.status = "archived";
			log(d, "console", "client.archive", id);
		},
		async deleteClient(app, id) {
			guard("deleteClient");
			const d = data(app);
			if (!d.clients.some((c) => c.id === id)) throw new PortError("not-found", id);
			d.clients = d.clients.filter((c) => c.id !== id);
			d.appointments = d.appointments.filter((a) => a.clientId !== id);
			d.packages = d.packages.filter((p) => p.clientId !== id);
			log(d, "console", "client.delete", id);
		},
		async packages(app, clientId) {
			guard("packages");
			return data(app).packages.filter((p) => p.clientId === clientId);
		},
		async createPackage(app, clientId, input) {
			guard("createPackage");
			const d = data(app);
			if (!d.clients.some((c) => c.id === clientId)) throw new PortError("not-found", clientId);
			const pkg: Package = {
				id: `k${++seq}`,
				clientId,
				...input,
				payments: [],
			};
			d.packages.push(pkg);
			log(d, "console", "package.create", pkg.id);
			return pkg;
		},
		async updatePackage(app, clientId, packageId, patch) {
			guard("updatePackage");
			const d = data(app);
			const pkg = d.packages.find((p) => p.id === packageId && p.clientId === clientId);
			if (pkg === undefined) throw new PortError("not-found", packageId);
			const next = { ...pkg, ...patch };
			const used = packageUsage(next, d.appointments, today).used;
			if (next.sessions + next.bonus < used)
				throw new PortError("invalid", "fewer sessions than are already used");
			Object.assign(pkg, patch);
			log(d, "console", "package.edit", pkg.id);
			return pkg;
		},
		async addPayment(app, clientId, packageId, input, recordedBy) {
			guard("addPayment");
			const d = data(app);
			const pkg = d.packages.find((p) => p.id === packageId && p.clientId === clientId);
			if (pkg === undefined) throw new PortError("not-found", packageId);
			if (!Number.isSafeInteger(input.amountBani) || input.amountBani <= 0)
				throw new PortError("invalid", "a payment is a positive amount");
			pkg.payments.push({ id: `p${++seq}`, ...input, recordedBy });
			log(d, "console", "package.payment", pkg.id);
			return pkg;
		},
		async roster(app, weekStart) {
			guard("roster");
			const d = data(app);
			const end = addDays(weekStart, 6);
			return {
				people: d.columns.filter((c) => c.kind === "person"),
				entries: d.roster.filter((r) => r.date >= weekStart && r.date <= end),
			};
		},
		async requests(app) {
			guard("requests");
			return data(app).requests;
		},
		async markRequestHandled(app, id) {
			guard("markRequestHandled");
			const d = data(app);
			const r = d.requests.find((x) => x.id === id);
			if (r === undefined) throw new PortError("not-found", id);
			r.handled = true;
			log(d, "console", "request.handled", id);
		},
		async reminders(app, date): Promise<ReadonlyArray<ReminderItem>> {
			guard("reminders");
			const d = data(app);
			const items: ReminderItem[] = [];
			for (const appointment of d.appointments.filter(
				(a) => a.date === date && a.status !== "cancelled" && a.clientId !== null,
			)) {
				const client = d.clients.find((c) => c.id === appointment.clientId);
				const column = d.columns.find((c) => c.id === appointment.columnId);
				if (client !== undefined && column !== undefined)
					items.push({
						appointment,
						client,
						column,
						sent: d.sentReminders.has(appointment.id),
					});
			}
			return items.sort((a, b) => a.appointment.startMin - b.appointment.startMin);
		},
		async markReminderSent(app, appointmentId) {
			guard("markReminderSent");
			const d = data(app);
			if (!d.appointments.some((a) => a.id === appointmentId))
				throw new PortError("not-found", appointmentId);
			d.sentReminders.add(appointmentId);
			log(d, "console", "reminder.send", appointmentId);
		},
		async columns(app) {
			guard("columns");
			return data(app).columns;
		},
		async services(app) {
			guard("services");
			return data(app).services;
		},
		async roles(app) {
			guard("roles");
			return data(app).roles;
		},
		async saveRole(app, role) {
			guard("saveRole");
			const d = data(app);
			const i = d.roles.findIndex((r) => r.id === role.id);
			if (i < 0) throw new PortError("not-found", role.id);
			d.roles[i] = role;
			log(d, "console", "role.save", role.id);
			return role;
		},
		async audit(app) {
			guard("audit");
			return data(app).audit;
		},
		async pushPrefs(subject) {
			guard("pushPrefs");
			return prefs.get(subject) ?? { requests: false, reminders: false };
		},
		async savePushPrefs(subject, p) {
			guard("savePushPrefs");
			prefs.set(subject, p);
		},
	};
}
