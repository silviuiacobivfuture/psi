import { type FloorPlanDoc, FloorPlanDocSchema } from "@psi/ui/admin/floor-plan";
import { columnsOf, findConflicts, occupies, seriesDates } from "../domain/conflicts";
import { packageUsage } from "../domain/usage";
import { addDays, todayIso } from "../lib/dates";
import { appointmentChanges } from "./fake-audit";
import { createFakeProfile } from "./fake-profile";
import { reportOf } from "./fake-report";
import {
	type CalendarData,
	type ClientFilter,
	type ClinicPort,
	type LiveSignal,
	PortError,
	type ReminderItem,
	type TeamMember,
} from "./port";
import { capabilityMap } from "./role-map";
import type {
	Appointment,
	AppSlug,
	AssistantMode,
	AuditEvent,
	Client,
	Membership,
	Package,
	PushPrefs,
	SearchHit,
} from "./schema";
import { AppointmentPatchSchema, NewAppointmentSchema, NewClientSchema } from "./schema";
import type { AppData } from "./seed";
import { seedApp } from "./seed";
import { seedPlan } from "./seed-plan";

export interface FakeOptions {
	today?: string;
	/** subject → apps (and role names) they belong to. */
	members: Readonly<Record<string, ReadonlyArray<Membership>>>;
	/** subject → the name the team picker shows (the subject itself when absent). */
	names?: Readonly<Record<string, string>>;
	/** Subjects that are the estate's platform administrator (they may look at the app as anyone). */
	platformAdmins?: ReadonlyArray<string>;
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
	const prefs = new Map<string, PushPrefs>();
	const modes = new Map<string, AssistantMode>();
	const plans = new Map<AppSlug, FloorPlanDoc>();
	let seq = 1000;
	const guard = (method: keyof ClinicPort): void => {
		if (opts.failing?.has(method) === true)
			throw new PortError("unavailable", `${method} is unavailable`);
	};
	// The fake does not know who asks: what the console does is the first member's, as the service would record the subject.
	const me = Object.keys(opts.members)[0] ?? "console";
	const log = (
		d: AppData,
		actor: string,
		action: string,
		target: string,
		extra: Partial<AuditEvent> = {},
	): void => {
		const assistant = actor.endsWith(" · assistant");
		const e: AuditEvent = {
			id: `e${++seq}`,
			at: new Date().toISOString().slice(0, 19),
			actor: actor === "console" ? me : actor,
			action,
			target,
			targetType: target.includes(":")
				? target.slice(0, target.indexOf(":"))
				: (action.replace(/^assistant\./, "").split(".")[0] ?? ""),
			targetId: target.includes(":") ? target.slice(target.indexOf(":") + 1) : target,
			source: assistant ? "assistant" : "console",
			requestId: `req-${seq}`,
			ip: "192.0.2.10",
			device: "Chrome pe Linux",
			...extra,
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
	const LOOKUPS = [
		"people_view",
		"rooms_view",
		"devices_view",
		"services_view",
		"group_activities_view",
	];

	const profile = createFakeProfile(Object.keys(opts.members));
	return {
		...profile,
		async capabilities(subject, app, as) {
			guard("capabilities");
			const mine = opts.members[subject]?.find((x) => x.app === app);
			if (mine === undefined) throw new PortError("not-found", app);
			const d = data(app);
			const holds = (ids: ReadonlyArray<string>) => d.roles.filter((r) => ids.includes(r.id));
			let roles = holds(mine.roles);
			let who = subject;
			if (as !== undefined) {
				const here = holds(mine.roles);
				if (
					opts.platformAdmins?.includes(subject) !== true &&
					!here.some((r) => r.grants.roles?.edit !== undefined)
				)
					throw new PortError("forbidden", "roles administrators only");
				const [kind, id = ""] = [as.slice(0, as.indexOf(":")), as.slice(as.indexOf(":") + 1)];
				if (kind === "role") {
					roles = holds([id]);
					if (roles.length === 0) throw new PortError("not-found", as);
				} else {
					const other = Object.entries(opts.members).find(
						([s, ms]) => s === id && ms.some((x) => x.app === app),
					);
					if (other === undefined) throw new PortError("not-found", as);
					roles = holds(other[1].find((x) => x.app === app)?.roles ?? []);
				}
				who = as;
			}
			const permissions: Record<string, ("all" | "assigned" | "own")[]> = {};
			const groups = new Set<string>();
			for (const r of roles) {
				for (const [k, v] of Object.entries(capabilityMap(r))) {
					const had = permissions[k] ?? [];
					permissions[k] = [...new Set([...had, ...v])];
				}
				for (const g of r.fieldGroups) groups.add(g);
				if (r.grants.calendars?.view !== undefined || r.grants.settings?.view !== undefined)
					for (const k of LOOKUPS) permissions[k] = ["all"];
			}
			return {
				app,
				appName: app === "psizone" ? "Psizone" : "Hemi-Sync",
				timeZone: "Europe/Bucharest",
				subject: who,
				displayName:
					as === undefined
						? (opts.names?.[subject] ?? subject)
						: as.startsWith("role:")
							? (roles[0]?.name ?? as)
							: (opts.names?.[as.slice("member:".length)] ?? as),
				roles: roles.map((r) => r.id),
				permissions,
				denied: [],
				...(as === undefined
					? {}
					: {
							viewAs: {
								kind: as.startsWith("role:") ? ("role" as const) : ("member" as const),
								id: as.slice(as.indexOf(":") + 1),
							},
						}),
				fieldGroups: (["contact", "guardian", "money", "clinical"] as const).filter((g) =>
					groups.has(g),
				),
				// A therapist is the first person column: the fake has no link between people and columns, so one is chosen.
				reach: {
					own:
						(as === undefined || as.startsWith("member:")) &&
						roles.some((r) => r.id === "therapist")
							? d.columns
									.filter((c) => c.kind === "person")
									.slice(0, 1)
									.map((c) => c.id)
							: [],
					assigned: [],
				},
				platformAdmin: as === undefined && opts.platformAdmins?.includes(subject) === true,
			};
		},
		async members(app): Promise<ReadonlyArray<TeamMember>> {
			guard("members");
			return Object.entries(opts.members).flatMap(([subject, ms]) =>
				ms
					.filter((x) => x.app === app)
					.map((x) => ({ subject, displayName: opts.names?.[subject] ?? subject, roles: x.roles })),
			);
		},
		async startViewAs(subject, app, as) {
			guard("startViewAs");
			const caps = await this.capabilities(subject, app, as);
			log(data(app), subject, "view_as.start", as);
			return caps;
		},
		async stopViewAs(subject, app) {
			guard("stopViewAs");
			log(data(app), subject, "view_as.stop", app);
		},
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
			const changes = appointmentChanges(a, patch);
			Object.assign(a, next);
			log(d, "console", "appointment.edit", id, { changes });
			tell(app, { stream: "calendar" });
			return a;
		},
		async cancelAppointment(app, id, reason) {
			guard("cancelAppointment");
			const d = data(app);
			const a = d.appointments.find((x) => x.id === id);
			if (a === undefined) throw new PortError("not-found", id);
			const was = a.status;
			a.status = "cancelled";
			a.cancelReason = reason.slice(0, 500);
			log(d, "console", "appointment.cancel", id, {
				reason: a.cancelReason,
				changes: [{ field: "status", before: was, after: "cancelled" }],
			});
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
				email: input.email === "" || input.email === undefined ? null : input.email,
				status: "current",
				note: "",
				practitionerId: null,
				...(input.birthYear === undefined ? {} : { birthYear: input.birthYear }),
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
		async report(app, q) {
			guard("report");
			return reportOf(data(app), today, q);
		},
		async audit(app) {
			guard("audit");
			return data(app).audit;
		},
		async floorPlan(app) {
			guard("floorPlan");
			return { doc: plans.get(app) ?? seedPlan(app), writable: true };
		},
		async saveFloorPlan(app, raw) {
			guard("saveFloorPlan");
			const parsed = FloorPlanDocSchema.safeParse(raw);
			if (!parsed.success) return { ok: false, reason: "invalid" };
			const held = plans.get(app) ?? seedPlan(app);
			if (parsed.data.revision !== held.revision) return { ok: false, reason: "stale" };
			const doc = { ...parsed.data, revision: held.revision + 1 };
			plans.set(app, doc);
			log(data(app), "console", "floor-plan.save", `revision ${doc.revision}`);
			return { ok: true, doc };
		},
		async pushPrefs(subject) {
			guard("pushPrefs");
			return prefs.get(subject) ?? { requests: false, reminders: false };
		},
		async savePushPrefs(subject, p) {
			guard("savePushPrefs");
			prefs.set(subject, p);
		},
		async assistantMode(subject) {
			guard("assistantMode");
			return modes.get(subject) ?? null;
		},
		async saveAssistantMode(subject, mode) {
			guard("saveAssistantMode");
			modes.set(subject, mode);
		},
	};
}
