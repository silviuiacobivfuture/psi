import { columnsOf, findConflicts, occupies, seriesDates } from "../domain/conflicts";
import { packageUsage } from "../domain/usage";
import { addDays, todayIso } from "../lib/dates";
import { createFakeAccess } from "./fake-caps";
import { createFakeClinical } from "./fake-clinical";
import { createFakeFloorAndPrefs } from "./fake-floor";
import {
	type CalendarData,
	type ClientFilter,
	type ClinicPort,
	type LiveSignal,
	PortError,
	type ReminderItem,
	type TeamMember,
} from "./port";
import type {
	Appointment,
	AppSlug,
	AuditEvent,
	Client,
	Membership,
	Package,
	SearchHit,
} from "./schema";
import { AppointmentPatchSchema, NewAppointmentSchema, NewClientSchema } from "./schema";
import type { AppData } from "./seed";
import { seedApp } from "./seed";

export interface FakeOptions {
	today?: string;
	/** subject → apps (and role names) they belong to. */
	members: Readonly<Record<string, ReadonlyArray<Membership>>>;
	/** subject → the name the team picker shows (the subject itself when absent). */
	names?: Readonly<Record<string, string>>;
	/** Subjects who administer the platform (the estate owner), not only an app. */
	platformAdmins?: ReadonlySet<string>;
	/** Methods that fail with `unavailable`, to show the error states. */
	failing?: ReadonlySet<keyof ClinicPort>;
	/** Start with no clients, appointments, packages, requests or audit events (the empty states). */
	empty?: boolean;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
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

	// The live bus: a write tells every open stream of the app that its screen changed.
	const listeners = new Set<{ app: AppSlug; push: (s: LiveSignal) => void }>();
	const tell = (app: AppSlug, signal: LiveSignal): void => {
		for (const l of listeners) if (l.app === app) l.push(signal);
	};
	const openRequests = (d: AppData): number => d.requests.filter((r) => !r.handled).length;

	const access = createFakeAccess({
		members: opts.members,
		names: opts.names,
		platformAdmins: opts.platformAdmins,
		data,
		guard,
		log,
	});

	const floorAndPrefs = createFakeFloorAndPrefs({ data, guard, log });
	const clinical = createFakeClinical({ today, data, guard, log, nextId: (p) => `${p}${++seq}` });

	return {
		...access,
		...clinical,
		async *live(app, signal) {
			const queue: LiveSignal[] = [];
			let wake: (() => void) | undefined;
			const entry = {
				app,
				push: (s: LiveSignal) => {
					queue.push(s);
					wake?.();
				},
			};
			listeners.add(entry);
			signal.addEventListener("abort", () => wake?.());
			try {
				while (!signal.aborted) {
					const next = queue.shift();
					if (next !== undefined) yield next;
					else
						await new Promise<void>((resolve) => {
							wake = resolve;
						});
				}
			} finally {
				listeners.delete(entry);
			}
		},
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
		async appointment(app, id) {
			guard("appointment");
			return data(app).appointments.find((a) => a.id === id) ?? null;
		},
		async createAppointments(app, raw) {
			guard("createAppointments");
			const d = data(app);
			const input = NewAppointmentSchema.parse(raw);
			const svc = d.services.find((s) => s.id === input.serviceId);
			const ids = [input.columnId, ...input.resourceIds];
			const pkg =
				input.packageId === null
					? null
					: (d.packages.find((p) => p.id === input.packageId && p.clientId === input.clientId) ??
						null);
			if (
				svc === undefined ||
				!ids.every((id) => d.columns.some((c) => c.id === id)) ||
				!d.clients.some((c) => c.id === input.clientId) ||
				(input.packageId !== null && pkg === null)
			)
				throw new PortError("invalid", "unknown service, column, resource, client or package");
			const durationMin = input.durationMin ?? svc.durationMin;
			const dates =
				input.recurrence === null
					? [input.date]
					: seriesDates(input.date, input.recurrence, addDays);
			const clashes = dates.flatMap((date) =>
				findConflicts(d.appointments, {
					date,
					startMin: input.startMin,
					durationMin,
					columnIds: ids,
				}),
			);
			if (clashes.length > 0) throw new PortError("conflict", "the time is taken", clashes);
			const seriesId = dates.length > 1 ? `r${++seq}` : null;
			const made = dates.map(
				(date): Appointment => ({
					id: `a${++seq}`,
					date,
					startMin: input.startMin,
					durationMin,
					columnId: input.columnId,
					clientId: input.clientId,
					title: null,
					serviceId: svc.id,
					status: input.status,
					note: input.note,
					packageId: input.packageId,
					resourceIds: input.resourceIds,
					priceBani: input.packageId === null ? (input.priceBani ?? svc.priceBani ?? 0) : 0,
					paidMethod: null,
					remind: input.remind,
					seriesId,
					cancelReason: null,
				}),
			);
			d.appointments.push(...made);
			for (const a of made) log(d, "console", "appointment.create", a.id);
			tell(app, { stream: "calendar" });
			return made;
		},
		async updateAppointment(app, id, raw) {
			guard("updateAppointment");
			const d = data(app);
			const patch = AppointmentPatchSchema.parse(raw);
			const a = d.appointments.find((x) => x.id === id);
			if (a === undefined) throw new PortError("not-found", id);
			const next: Appointment = { ...a, ...stripUndefined(patch) };
			if (
				!d.columns.some((c) => c.id === next.columnId) ||
				!next.resourceIds.every((r) => d.columns.some((c) => c.id === r)) ||
				(next.clientId !== null && !d.clients.some((c) => c.id === next.clientId)) ||
				!d.services.some((s) => s.id === next.serviceId)
			)
				throw new PortError("invalid", "unknown column, resource, client or service");
			if (
				next.packageId !== null &&
				!d.packages.some((p) => p.id === next.packageId && p.clientId === next.clientId)
			)
				throw new PortError("invalid", "the package is not this client's");
			const clashes = occupies(next)
				? findConflicts(d.appointments, {
						date: next.date,
						startMin: next.startMin,
						durationMin: next.durationMin,
						columnIds: columnsOf(next),
						ignoreId: id,
					})
				: [];
			if (clashes.length > 0) throw new PortError("conflict", "the time is taken", clashes);
			Object.assign(a, next);
			log(d, "console", "appointment.edit", id);
			tell(app, { stream: "calendar" });
			return a;
		},
		async cancelAppointment(app, id, reason) {
			guard("cancelAppointment");
			const d = data(app);
			const a = d.appointments.find((x) => x.id === id);
			if (a === undefined) throw new PortError("not-found", id);
			a.status = "cancelled";
			a.cancelReason = reason.slice(0, 500);
			log(d, "console", "appointment.cancel", id);
			tell(app, { stream: "calendar" });
			return a;
		},
		async collectPayment(app, id, method) {
			guard("collectPayment");
			const d = data(app);
			const a = d.appointments.find((x) => x.id === id);
			if (a === undefined) throw new PortError("not-found", id);
			a.paidMethod = method;
			log(d, "console", "appointment.payment", id);
			tell(app, { stream: "calendar" });
			return a;
		},
		async findConflicts(app, probe) {
			guard("findConflicts");
			return findConflicts(data(app).appointments, probe);
		},
		async createClient(app, raw) {
			guard("createClient");
			const d = data(app);
			const input = NewClientSchema.parse(raw);
			const c: Client = {
				id: `c${++seq}`,
				name: input.name,
				guardian: input.guardian === "" ? null : input.guardian,
				phone: input.phone === "" ? null : input.phone,
				email: null,
				status: "current",
				note: "",
				practitionerId: null,
			};
			d.clients.push(c);
			log(d, "console", "client.create", c.id);
			return c;
		},
		async appendAudit(app, entry) {
			guard("appendAudit");
			log(data(app), entry.actor, entry.action, entry.target);
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
					(q === "" ||
						c.name.toLocaleLowerCase().includes(q) ||
						(c.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))),
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
			tell(app, { stream: "requests" });
			tell(app, { stream: "inbox", counts: { requests: openRequests(d) } });
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
		...floorAndPrefs,
	};
}
