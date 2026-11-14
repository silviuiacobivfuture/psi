import type {
	ActivityEvent,
	Attention,
	Booking,
	Principal,
	ReminderSent,
	ReminderTarget,
	Resource,
	ResourceState,
	Appointment as StaffAppointment,
	StaffPort,
	WebRequest as StaffRequest,
} from "@psi/engine/staff";
import type { Person } from "../auth";
import { packageUsage, paidBani } from "../domain/usage";
import { addDays, parseDay, todayIso, weekStart } from "../lib/dates";
import type { ClinicPort } from "../port/port";
import type { Appointment, AppSlug, Client, Column, Package } from "../port/schema";
import { mayDo } from "./permissions";
import { configMethods } from "./staff-port-config";
import { type ActionsSource, extraMethods } from "./staff-port-extra";
import { ok, refused, wrap } from "./staff-result";

/**
 * What the assistant looks through when it is not given dates: the two months before today and the two after, read as two
 * windows the service accepts (it answers at most 62 days at a time, never the clinic's whole history at once).
 */
const AROUND_DAYS = 60;

const LIVE = new Set(["requested", "confirmed", "attended", "no-show", "cancelled"]);
const isStaffStatus = (s: string): s is StaffAppointment["status"] => LIVE.has(s);

export interface StaffPortOptions {
	port: ClinicPort;
	app: AppSlug;
	appName: string;
	person: Person;
	roles: ReadonlyArray<string>;
	/** The permission keys the console holds for this request (`Object.keys(caps.permissions)`): the viewed role's while viewing as one. */
	permissions: ReadonlyArray<string>;
	/** Looking at the app as someone else: the assistant reads, and cannot change anything. */
	readOnly: boolean;
	locale: "ro" | "en";
	/** The action registry for this person (`apps/clinic/src/actions`); none: the assistant discovers nothing beyond its own tools. */
	actions?: ActionsSource;
}

const versionOf = (a: Appointment): string =>
	`${a.status}|${a.date}|${a.startMin}|${a.columnId}|${a.durationMin}`;
/** A package as the assistant counts it: money from its ledger, sessions from the appointments linked to it. */
interface Counted {
	pkg: Package;
	used: number;
	paidBani: number;
}
const countedOf = (pkg: Package, appointments: ReadonlyArray<Appointment>): Counted => ({
	pkg,
	used: packageUsage(pkg, appointments, "").used,
	paidBani: paidBani(pkg),
});
const packageVersion = (c: Counted): string => `${c.paidBani}|${c.used}|${c.pkg.totalBani}`;
const staffPackage = (c: Counted) => ({
	id: c.pkg.id,
	clientId: c.pkg.clientId,
	version: packageVersion(c),
	name: c.pkg.name,
	sessions: c.pkg.sessions,
	bonus: c.pkg.bonus,
	used: c.used,
	totalBani: c.pkg.totalBani,
	paidBani: c.paidBani,
});

function mapKind(kind: Column["kind"]): Resource["kind"] {
	return kind;
}

/**
 * The assistant's port over the console's own `ClinicPort`, for one signed-in person in one app.
 * Every call goes through the same port the screens use, so the assistant sees and changes
 * exactly what the console does for this person, and nothing else. When the scheduling service's
 * SDK backs `ClinicPort`, this becomes the SDK-with-the-person's-token adapter.
 */
export function createStaffPort(o: StaffPortOptions): StaffPort {
	const { port, app } = o;
	const { permissions } = o;
	const principal: Principal = {
		sub: o.person.subject,
		name: o.person.name,
		appId: app,
		appName: o.appName,
		roles: [...o.roles],
		locale: o.locale,
	};
	const everything = (): Promise<{
		appts: ReadonlyArray<Appointment>;
		clients: ReadonlyArray<Client>;
		columns: ReadonlyArray<Column>;
	}> =>
		Promise.all([
			port.calendar(app, addDays(todayIso(), -AROUND_DAYS), todayIso()),
			port.calendar(app, addDays(todayIso(), 1), addDays(todayIso(), AROUND_DAYS + 1)),
		]).then(([before, after]) => ({
			appts: [...before.appointments, ...after.appointments],
			clients: [...new Map([...before.clients, ...after.clients].map((c) => [c.id, c])).values()],
			columns: after.columns,
		}));

	/** The calendar of the days asked (the port reads a long span window by window), never the clinic's whole history. */
	const between = (from: string, to: string) =>
		port
			.calendar(app, from, to)
			.then((c) => ({ appts: c.appointments, clients: c.clients, columns: c.columns }));
	/** One appointment by its id, on any date, with its client: never a calendar searched for it. */
	const one = async (
		id: string,
	): Promise<{ appt: Appointment | undefined; clients: ReadonlyArray<Client> }> => {
		const appt = (await port.appointment(app, id)) ?? undefined;
		const clients =
			appt?.clientId === null || appt?.clientId === undefined
				? []
				: await port.clientsByIds(app, [appt.clientId]);
		return { appt, clients };
	};

	const nameOf = (clients: ReadonlyArray<Client>, id: string | null): string | null =>
		clients.find((c) => c.id === id)?.name ?? null;

	const staffAppt = (
		a: Appointment,
		clients: ReadonlyArray<Client>,
	): StaffAppointment | undefined =>
		isStaffStatus(a.status)
			? {
					id: a.id,
					version: versionOf(a),
					date: a.date,
					startMin: a.startMin,
					durationMin: a.durationMin,
					resourceIds: [a.columnId],
					clientId: a.clientId,
					clientName: nameOf(clients, a.clientId),
					title: a.title,
					serviceId: a.serviceId,
					status: a.status,
					...(a.note === "" ? {} : { note: a.note }),
				}
			: undefined;

	const busy = (
		appts: ReadonlyArray<Appointment>,
		q: {
			date: string;
			startMin: number;
			durationMin: number;
			resourceIds: ReadonlyArray<string>;
			ignoreAppointmentId?: string;
		},
	): Array<string> =>
		q.resourceIds.filter((rid) =>
			appts.some(
				(a) =>
					a.id !== q.ignoreAppointmentId &&
					a.status !== "cancelled" &&
					a.date === q.date &&
					a.columnId === rid &&
					a.startMin < q.startMin + q.durationMin &&
					q.startMin < a.startMin + a.durationMin,
			),
		);

	const countedPackages = async (clientId: string): Promise<Counted[]> => {
		const [packages, appointments] = await Promise.all([
			port.packages(app, clientId),
			port.clientAppointments(app, clientId),
		]);
		return packages.map((p) => countedOf(p, appointments));
	};

	const audit = (action: string, target: string): Promise<void> =>
		port.appendAudit(app, { actor: `${o.person.name} · assistant`, action, target });

	return {
		...extraMethods({
			port,
			app,
			actor: o.person.name,
			readOnly: o.readOnly,
			actions: o.actions,
		}),
		...configMethods({ port, app, readOnly: o.readOnly }),
		whoami: async () => ok(principal),
		can: async (action) => ok(!o.readOnly && mayDo(permissions, action)),
		capabilities: async () => ok({ permissions: [...permissions] }),
		audit: (entry) =>
			wrap(async () => {
				await audit(
					`assistant.${entry.phase}.${entry.tool}`,
					entry.proposalId ?? entry.subjects[0] ?? "-",
				);
				return ok(null);
			}),
		resources: () =>
			wrap(async () =>
				ok(
					(await port.columns(app)).map(
						(c): Resource => ({ id: c.id, kind: mapKind(c.kind), name: c.name }),
					),
				),
			),
		services: () =>
			wrap(async () =>
				ok(
					(await port.services(app)).map((s) => ({
						id: s.id,
						name: s.name,
						durationMin: s.durationMin,
						priceBani: s.priceBani,
					})),
				),
			),
		findClients: (q) =>
			wrap(async () => {
				const current = await port.clients(app, "current", q.query);
				const archived = q.includeArchived ? await port.clients(app, "archived", q.query) : [];
				return ok(
					[...current, ...archived]
						.slice(0, q.limit)
						.map((c) => ({ id: c.id, name: c.name, status: c.status, phone: c.phone })),
				);
			}),
		clientSummary: (id) =>
			wrap(async () => {
				const c = await port.client(app, id);
				if (c === null) return refused("not_found");
				const [appts, packages] = await Promise.all([
					port.clientAppointments(app, id),
					port.packages(app, id),
				]);
				const today = new Date().toISOString().slice(0, 10);
				const mapped = appts.flatMap((a) => staffAppt(a, [c]) ?? []);
				return ok({
					id: c.id,
					version: "1",
					name: c.name,
					status: c.status,
					phone: c.phone,
					email: c.email,
					guardian: c.guardian,
					practitionerId: c.practitionerId,
					...(c.note === "" ? {} : { note: c.note }),
					upcoming: mapped.filter((a) => a.date >= today).slice(0, 20),
					recent: mapped.filter((a) => a.date < today).slice(-10),
					packages: packages.map((p) => staffPackage(countedOf(p, appts))),
				});
			}),
		agenda: (q) =>
			wrap(async () => {
				const cal = await port.calendar(app, q.from, q.to);
				return ok(
					cal.appointments
						.filter((a) => q.resourceId === undefined || a.columnId === q.resourceId)
						.flatMap((a) => staffAppt(a, cal.clients) ?? []),
				);
			}),
		appointment: (id) =>
			wrap(async () => {
				const { appt: found, clients } = await one(id);
				const mapped = found === undefined ? undefined : staffAppt(found, clients);
				return mapped === undefined ? refused("not_found") : ok(mapped);
			}),
		freeSlots: (q) =>
			wrap(async () => {
				const { appts, columns } = await between(q.from, q.to);
				const services = await port.services(app);
				const service = services.find((s) => s.id === q.serviceId);
				if (service === undefined) return refused("not_found");
				const resourceId = q.resourceId ?? columns.find((c) => c.kind === "person")?.id;
				if (resourceId === undefined) return ok([]);
				const slots = [];
				for (let day = q.from; day <= q.to && slots.length < q.limit; day = addDays(day, 1)) {
					const dow = parseDay(day).getUTCDay();
					if (dow === 0 || dow === 6) continue;
					for (
						let start = 540;
						start + service.durationMin <= 1080 && slots.length < q.limit;
						start += 30
					) {
						const query = {
							date: day,
							startMin: start,
							durationMin: service.durationMin,
							resourceIds: [resourceId],
						};
						if (busy(appts, query).length === 0) slots.push(query);
					}
				}
				return ok(slots);
			}),
		checkSlot: (q) =>
			wrap(async () => {
				const { appts } = await between(q.date, q.date);
				const taken = busy(appts, q);
				return ok({ free: taken.length === 0, busyResourceIds: taken });
			}),
		createAppointment: (i) =>
			wrap(async () => {
				if (o.readOnly) return refused("forbidden");
				const clients = i.clientId === undefined ? [] : await port.clientsByIds(app, [i.clientId]);
				const column = i.resourceIds[0];
				if (column === undefined) return refused("invalid");
				const [made] = await port.createAppointments(app, {
					date: i.date,
					startMin: i.startMin,
					columnId: column,
					clientId: i.clientId,
					serviceId: i.serviceId,
				});
				if (made === undefined) return refused("invalid");
				await audit("assistant.appointment.create", made.id);
				const mapped = staffAppt(made, clients);
				return mapped === undefined ? refused("invalid") : ok(mapped);
			}),
		moveAppointment: (i) =>
			wrap(async () => {
				if (o.readOnly) return refused("forbidden");
				const { appt: current, clients } = await one(i.id);
				if (current === undefined) return refused("not_found");
				if (versionOf(current) !== i.expectedVersion) return refused("conflict");
				const moved = await port.updateAppointment(app, i.id, {
					date: i.date,
					startMin: i.startMin,
					columnId: i.resourceIds[0] ?? current.columnId,
				});
				const mapped = staffAppt(moved, clients);
				return mapped === undefined ? refused("invalid") : ok(mapped);
			}),
		cancelAppointment: (i) =>
			wrap(async () => {
				if (o.readOnly) return refused("forbidden");
				const { appt: current } = await one(i.id);
				if (current === undefined) return refused("not_found");
				if (versionOf(current) !== i.expectedVersion) return refused("conflict");
				await port.updateAppointment(app, i.id, { status: "cancelled" });
				return ok(null);
			}),
		markAttendance: (i) =>
			wrap(async () => {
				if (o.readOnly) return refused("forbidden");
				const { appt: current, clients } = await one(i.id);
				if (current === undefined) return refused("not_found");
				if (versionOf(current) !== i.expectedVersion) return refused("conflict");
				const next = await port.updateAppointment(app, i.id, { status: i.status });
				const mapped = staffAppt(next, clients);
				return mapped === undefined ? refused("invalid") : ok(mapped);
			}),
		packages: (clientId) =>
			wrap(async () => ok((await countedPackages(clientId)).map(staffPackage))),
		recordPayment: (i) =>
			wrap(async () => {
				if (o.readOnly) return refused("forbidden");
				const found = (await countedPackages(i.clientId)).find((c) => c.pkg.id === i.packageId);
				if (found === undefined) return refused("not_found");
				if (packageVersion(found) !== i.expectedVersion) return refused("conflict");
				if (found.paidBani + i.amountBani > found.pkg.totalBani) return refused("invalid");
				const saved = await port.addPayment(
					app,
					i.clientId,
					i.packageId,
					{ date: todayIso(), amountBani: i.amountBani, method: "cash" },
					o.person.name,
				);
				await audit("assistant.payment.record", saved.id);
				return ok(staffPackage(countedOf(saved, await port.clientAppointments(app, i.clientId))));
			}),
		roster: (q) =>
			wrap(async () => {
				const out = [];
				for (let w = weekStart(q.from); w <= q.to; w = addDays(w, 7)) {
					const { entries } = await port.roster(app, w);
					out.push(
						...entries.filter(
							(e) =>
								e.date >= q.from &&
								e.date <= q.to &&
								(q.personId === undefined || e.personId === q.personId),
						),
					);
				}
				return ok(out);
			}),
		// The console's port has no roster write yet: said plainly, never faked.
		requestLeave: async () => refused("unavailable"),
		webRequests: (q) =>
			wrap(async () =>
				ok(
					(await port.requests(app)).filter((r) => q.includeHandled || !r.handled).map(mapRequest),
				),
			),
		webRequest: (id) =>
			wrap(async () => {
				const found = (await port.requests(app)).find((r) => r.id === id);
				return found === undefined ? refused("not_found") : ok(mapRequest(found));
			}),
		markRequestHandled: (i) =>
			wrap(async () => {
				if (o.readOnly) return refused("forbidden");
				const found = (await port.requests(app)).find((r) => r.id === i.id);
				if (found === undefined) return refused("not_found");
				if (found.handled) return refused("conflict");
				await port.markRequestHandled(app, i.id);
				return ok(null);
			}),
		reminderTargets: (date) =>
			wrap(async () =>
				ok(
					(await port.reminders(app, date)).map(
						(r): ReminderTarget => ({
							appointmentId: r.appointment.id,
							version: versionOf(r.appointment),
							clientName: r.client.name,
							phone: r.client.phone,
							email: r.client.email,
							date: r.appointment.date,
							startMin: r.appointment.startMin,
							resourceName: r.column.name,
							sent: r.sent,
						}),
					),
				),
			),
		sendReminder: (i) =>
			wrap<ReminderSent>(async () => {
				if (i.about !== "appointment" || i.appointmentId === undefined) return refused("invalid");
				await port.markReminderSent(app, i.appointmentId);
				if (i.channel === "email") return ok({ channel: "email" as const });
				const { appt, clients } = await one(i.appointmentId);
				const phone = clients.find((c) => c.id === appt?.clientId)?.phone ?? "";
				const digits = phone.replace(/\D/g, "");
				const intl = digits.startsWith("0") ? `40${digits.slice(1)}` : digits;
				return intl.length >= 8
					? ok({
							channel: "whatsapp" as const,
							link: `https://wa.me/${intl}?text=${encodeURIComponent(i.text)}`,
						})
					: refused("invalid");
			}),
		searchNotes: (q) =>
			wrap(async () => {
				const clients = [
					...(await port.clients(app, "current", "")),
					...(await port.clients(app, "archived", "")),
				];
				const wanted = q.text.toLocaleLowerCase();
				return ok(
					clients
						.filter(
							(c) =>
								c.note.toLocaleLowerCase().includes(wanted) &&
								(q.clientId === undefined || c.id === q.clientId),
						)
						.slice(0, q.limit)
						.map((c) => ({
							id: c.id,
							clientId: c.id,
							date: new Date().toISOString().slice(0, 10),
							text: c.note,
						})),
				);
			}),
		stats: (q) =>
			wrap(async () => {
				const cal = await port.calendar(app, q.from, q.to);
				const live = cal.appointments.filter((a) => isStaffStatus(a.status));
				const count = (s: string): number => live.filter((a) => a.status === s).length;
				const owing = await unpaid(port, app);
				return ok({
					from: q.from,
					to: q.to,
					sessions: live.length,
					attended: count("attended"),
					noShows: count("no-show"),
					cancelled: count("cancelled"),
					unpaidClients: new Set(owing.map((p) => p.clientId)).size,
					unpaidBani: owing.reduce((s, p) => s + (p.totalBani - paidBani(p)), 0),
				});
			}),
		roomsAt: (q) =>
			wrap(async () => {
				const { appts, clients, columns } = await between(q.date, q.date);
				return ok(
					columns
						.filter((c) => c.kind !== "person")
						.map((c): ResourceState => {
							const held = appts.find(
								(a) =>
									a.status !== "cancelled" &&
									a.date === q.date &&
									a.columnId === c.id &&
									a.startMin < q.startMin + q.durationMin &&
									q.startMin < a.startMin + a.durationMin,
							);
							return {
								resource: { id: c.id, kind: mapKind(c.kind), name: c.name },
								busy:
									held === undefined
										? null
										: {
												appointmentId: held.id,
												startMin: held.startMin,
												durationMin: held.durationMin,
												clientName: nameOf(clients, held.clientId),
											},
							};
						}),
				);
			}),
		attention: (q) =>
			wrap(async () => {
				const clients = await port.clients(app, "current", "");
				const cal = await port.calendar(app, q.from, q.to);
				const out: Array<Attention> = [];
				for (const c of clients) {
					for (const { pkg: p, used, paidBani: paid } of await countedPackages(c.id)) {
						const left = p.sessions + p.bonus - used;
						const due = Math.max(0, p.totalBani - paid);
						if (due === 0 && left > q.lowAt) continue;
						out.push({
							clientId: c.id,
							clientName: c.name,
							packageId: p.id,
							packageName: p.name,
							sessionsLeft: left,
							dueBani: due,
							canEmail: c.email !== null,
							canWhatsapp: c.phone !== null,
							bookedInPeriod: cal.appointments.filter(
								(a) => a.clientId === c.id && a.status !== "cancelled",
							).length,
						});
					}
				}
				return ok(out);
			}),
		activity: (q) =>
			wrap(async () =>
				ok(
					(await port.audit(app))
						.filter((e) => e.at.slice(0, 10) >= q.from && e.at.slice(0, 10) <= q.to)
						.slice(0, q.limit)
						.map(mapAudit),
				),
			),
		bookings: (q) =>
			wrap(async () => {
				const { appts, clients } = await everything();
				const created = (await port.audit(app)).filter(
					(e) =>
						e.action.endsWith("appointment.create") &&
						e.at.slice(0, 10) >= q.from &&
						e.at.slice(0, 10) <= q.to,
				);
				const out: Array<Booking> = [];
				for (const e of created) {
					const a = appts.find((x) => x.id === e.target);
					if (a !== undefined && isStaffStatus(a.status))
						out.push({
							id: a.id,
							createdAt: e.at,
							date: a.date,
							startMin: a.startMin,
							clientName: nameOf(clients, a.clientId) ?? "",
							serviceName: a.serviceId,
							source: "staff",
							status: a.status,
						});
				}
				return ok(out.slice(0, q.limit));
			}),
	};
}

function mapRequest(r: {
	id: string;
	receivedAt: string;
	name: string;
	phone: string;
	service: string;
	message: string;
	handled: boolean;
}): StaffRequest {
	return {
		id: r.id,
		version: r.handled ? "handled" : "open",
		receivedAt: r.receivedAt,
		name: r.name,
		phone: r.phone,
		service: r.service,
		message: r.message,
		handled: r.handled,
		channel: "form",
	};
}

function mapAudit(e: { at: string; actor: string; action: string; target: string }): ActivityEvent {
	const [group = "", verb = "other"] = e.action.replace(/^assistant\./, "").split(".");
	const kind: ActivityEvent["kind"] =
		(
			[
				"appointment",
				"client",
				"payment",
				"leave",
				"request",
				"package",
				"record",
				"settings",
			] as const
		).find((k) => k === group) ?? "other";
	return {
		at: e.at.length === 19 ? `${e.at}Z` : e.at,
		kind,
		verb,
		actor: e.actor,
		label: null,
		subjectId: e.target,
	};
}

async function unpaid(port: ClinicPort, app: AppSlug): Promise<ReadonlyArray<Package>> {
	const clients = await port.clients(app, "current", "");
	const all = await Promise.all(clients.map((c) => port.packages(app, c.id)));
	return all.flat().filter((p) => p.totalBani > paidBani(p));
}
