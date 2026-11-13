import type { ActionInfo, ActionOutcome } from "../actions";
import type { StaffPage } from "../events";
import { foldName } from "../format";
import type {
	Appointment,
	Attention,
	ClientSummary,
	NoteHit,
	PackageBalance,
	Principal,
	ReminderTarget,
	ResourceState,
	WebRequest,
} from "../model";
import { baseKeys } from "../parity/needs";
import type {
	AuditEntry,
	NewClientInput,
	PortRefusal,
	PortResult,
	ReminderSent,
	SlotQuery,
	StaffAction,
	StaffPort,
} from "../port";
import { FAKE_ACTIONS } from "./fake-actions";
import { type FakeData, seed } from "./fake-seed";
import { RECEPTION_PERMISSIONS } from "./permissions";

/** 2026-11-13, a Friday, 09:00 in Bucharest. */
export const FAKE_NOW = Date.parse("2026-11-13T07:00:00Z");

export const FAKE_PRINCIPAL: Principal = {
	sub: "sub-ana",
	name: "Ana Pop",
	appId: "psizone",
	appName: "Psizone",
	roles: ["reception"],
	locale: "en",
	personId: "p1",
};

const ok = <T>(value: T): PortResult<T> => ({ ok: true, value });
const no = (reason: PortRefusal): PortResult<never> => ({ ok: false, reason });

/** One call the assistant made through the port, for tests to read. */
export interface PortCall {
	method: string;
	args: unknown;
}

/**
 * A scheduling service in memory, for tests: real state that changes with writes (versions move,
 * resources get busy), refusals on demand (`deny`), a failing audit on demand, and a log of every
 * call. It stands in for the console's SDK-backed port.
 */
export class FakeStaffPort implements StaffPort {
	readonly data: FakeData = seed();
	readonly calls: Array<PortCall> = [];
	readonly audits: Array<AuditEntry> = [];
	principal: Principal | null = FAKE_PRINCIPAL;
	failAudit = false;
	/** What the person may do; null makes the capabilities call fail. */
	permissions: ReadonlyArray<string> | null = RECEPTION_PERMISSIONS;
	/** What each route answers (by id); a route not listed answers an empty object. */
	readonly routeAnswers = new Map<string, unknown>();
	/** Methods or actions answered `forbidden`. */
	readonly denied = new Set<string>();
	/** Methods that answer `unavailable`. */
	readonly down = new Set<string>();
	private counter = 1;

	/** A seeded or created appointment; a test that names a missing one is wrong. */
	appointmentOf(id: string): Appointment {
		const found = this.data.appointments.find((a) => a.id === id);
		if (found === undefined) throw new Error(`no appointment ${id}`);
		return found;
	}

	packageOf(id: string): PackageBalance {
		const found = this.data.packages.find((p) => p.id === id);
		if (found === undefined) throw new Error(`no package ${id}`);
		return found;
	}

	reminderOf(appointmentId: string): ReminderTarget {
		const found = this.data.reminders.find((r) => r.appointmentId === appointmentId);
		if (found === undefined) throw new Error(`no reminder ${appointmentId}`);
		return found;
	}

	/** The signed-in person with some fields changed. */
	signIn(change: Partial<Principal>): void {
		this.principal = { ...FAKE_PRINCIPAL, ...change };
	}

	noteOf(id: string): NoteHit {
		const found = this.data.notes.find((n) => n.id === id);
		if (found === undefined) throw new Error(`no note ${id}`);
		return found;
	}

	requestOf(id: string): WebRequest {
		const found = this.data.requests.find((r) => r.id === id);
		if (found === undefined) throw new Error(`no request ${id}`);
		return found;
	}

	/** The calls to one method. */
	callsTo(method: string): Array<PortCall> {
		return this.calls.filter((c) => c.method === method);
	}

	/** Every write the assistant has made through the port. */
	writes(): Array<PortCall> {
		const writes = [
			"createAppointment",
			"moveAppointment",
			"cancelAppointment",
			"markAttendance",
			"recordPayment",
			"requestLeave",
			"markRequestHandled",
			"sendReminder",
			"createClient",
			"runAction",
		];
		return this.calls.filter((c) => writes.includes(c.method));
	}

	private gate(method: string, args: unknown): PortResult<never> | undefined {
		this.calls.push({ method, args });
		if (this.down.has(method)) return no("unavailable");
		if (this.denied.has(method)) return no("forbidden");
		return undefined;
	}

	private bump(): string {
		this.counter += 1;
		return `v${this.counter}`;
	}

	async whoami(): Promise<PortResult<Principal>> {
		this.calls.push({ method: "whoami", args: [] });
		return this.principal === null ? no("forbidden") : ok(this.principal);
	}

	async can(action: StaffAction, subjectId?: string): Promise<PortResult<boolean>> {
		this.calls.push({ method: "can", args: { action, subjectId } });
		return ok(!this.denied.has(action));
	}

	async audit(entry: AuditEntry): Promise<PortResult<null>> {
		this.calls.push({ method: "audit", args: entry });
		if (this.failAudit) return no("unavailable");
		this.audits.push(entry);
		return ok(null);
	}

	async resources() {
		return this.gate("resources", []) ?? ok(this.data.resources);
	}

	async services() {
		return this.gate("services", []) ?? ok(this.data.services);
	}

	async findClients(q: { query: string; includeArchived: boolean; limit: number }) {
		const denied = this.gate("findClients", q);
		if (denied) return denied;
		const wanted = foldName(q.query);
		return ok(
			this.data.clients
				.filter(
					(c) =>
						(q.includeArchived || c.status === "current") &&
						(foldName(c.name).includes(wanted) ||
							(c.phone ?? "").replace(/\s/g, "").includes(wanted.replace(/\s/g, ""))),
				)
				.slice(0, q.limit)
				.map((c) => ({
					id: c.id,
					name: c.name,
					status: c.status,
					phone: c.phone ?? null,
				})),
		);
	}

	async clientSummary(id: string) {
		const denied = this.gate("clientSummary", id);
		if (denied) return denied;
		const found = this.data.clients.find((c) => c.id === id);
		if (found === undefined) return no("not_found");
		const withPackages = this.data.packages.filter((p) => p.clientId === id);
		const summary: ClientSummary = {
			...found,
			upcoming: this.data.appointments.filter((a) => a.clientId === id),
			packages: withPackages,
		};
		return this.denied.has("clinical") ? ok({ ...summary, clinical: undefined }) : ok(summary);
	}

	async agenda(q: { from: string; to: string; resourceId?: string }) {
		const denied = this.gate("agenda", q);
		if (denied) return denied;
		return ok(
			this.data.appointments.filter(
				(a) =>
					a.date >= q.from &&
					a.date <= q.to &&
					a.status !== "cancelled" &&
					(q.resourceId === undefined || a.resourceIds.includes(q.resourceId)),
			),
		);
	}

	async appointment(id: string) {
		const denied = this.gate("appointment", id);
		if (denied) return denied;
		const found = this.data.appointments.find((a) => a.id === id);
		return found === undefined ? no("not_found") : ok(found);
	}

	private busy(q: SlotQuery): Array<string> {
		return q.resourceIds.filter((rid) =>
			this.data.appointments.some(
				(a) =>
					a.id !== q.ignoreAppointmentId &&
					a.status !== "cancelled" &&
					a.date === q.date &&
					a.resourceIds.includes(rid) &&
					a.startMin < q.startMin + q.durationMin &&
					q.startMin < a.startMin + a.durationMin,
			),
		);
	}

	async freeSlots(q: {
		serviceId: string;
		resourceId?: string;
		from: string;
		to: string;
		limit: number;
	}) {
		const denied = this.gate("freeSlots", q);
		if (denied) return denied;
		const service = this.data.services.find((s) => s.id === q.serviceId);
		if (service === undefined) return no("not_found");
		const resourceIds = [q.resourceId ?? "p1", "r1"];
		const slots = [];
		for (
			let day = q.from;
			day <= q.to;
			day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
		) {
			for (const startMin of [540, 600, 660, 720, 780, 840]) {
				const query = {
					date: day,
					startMin,
					durationMin: service.durationMin,
					resourceIds,
				};
				if (this.busy(query).length === 0) slots.push(query);
			}
		}
		return ok(slots.slice(0, q.limit));
	}

	async checkSlot(q: SlotQuery) {
		const denied = this.gate("checkSlot", q);
		if (denied) return denied;
		const busy = this.busy(q);
		return ok({ free: busy.length === 0, busyResourceIds: busy });
	}

	async createAppointment(i: {
		clientId: string;
		serviceId: string;
		date: string;
		startMin: number;
		durationMin: number;
		resourceIds: ReadonlyArray<string>;
	}) {
		const denied = this.gate("createAppointment", i);
		if (denied) return denied;
		if (this.busy(i).length > 0) return no("conflict");
		const client = this.data.clients.find((c) => c.id === i.clientId);
		if (client === undefined) return no("not_found");
		const made: Appointment = {
			id: `a${this.data.appointments.length + 1}`,
			version: this.bump(),
			date: i.date,
			startMin: i.startMin,
			durationMin: i.durationMin,
			resourceIds: [...i.resourceIds],
			clientId: i.clientId,
			clientName: client.name,
			title: null,
			serviceId: i.serviceId,
			status: "confirmed",
		};
		this.data.appointments.push(made);
		return ok(made);
	}

	private edit(
		id: string,
		expectedVersion: string,
		change: Partial<Appointment>,
	): PortResult<Appointment> {
		const at = this.data.appointments.findIndex((a) => a.id === id);
		const found = this.data.appointments[at];
		if (found === undefined) return no("not_found");
		if (found.version !== expectedVersion) return no("conflict");
		const next = { ...found, ...change, version: this.bump() };
		this.data.appointments[at] = next;
		return ok(next);
	}

	async moveAppointment(i: {
		id: string;
		expectedVersion: string;
		date: string;
		startMin: number;
		resourceIds: ReadonlyArray<string>;
	}) {
		const denied = this.gate("moveAppointment", i);
		if (denied) return denied;
		const current = this.data.appointments.find((a) => a.id === i.id);
		if (
			current !== undefined &&
			this.busy({
				date: i.date,
				startMin: i.startMin,
				durationMin: current.durationMin,
				resourceIds: i.resourceIds,
				ignoreAppointmentId: i.id,
			}).length > 0
		)
			return no("conflict");
		return this.edit(i.id, i.expectedVersion, {
			date: i.date,
			startMin: i.startMin,
			resourceIds: [...i.resourceIds],
		});
	}

	async cancelAppointment(i: { id: string; expectedVersion: string }) {
		const denied = this.gate("cancelAppointment", i);
		if (denied) return denied;
		const done = this.edit(i.id, i.expectedVersion, { status: "cancelled" });
		return done.ok ? ok(null) : done;
	}

	async markAttendance(i: { id: string; expectedVersion: string; status: "attended" | "no-show" }) {
		const denied = this.gate("markAttendance", i);
		if (denied) return denied;
		return this.edit(i.id, i.expectedVersion, { status: i.status });
	}

	async packages(clientId: string) {
		const denied = this.gate("packages", clientId);
		if (denied) return denied;
		return ok(this.data.packages.filter((p) => p.clientId === clientId));
	}

	async recordPayment(i: {
		clientId: string;
		packageId: string;
		expectedVersion: string;
		amountBani: number;
		method: string;
	}) {
		const denied = this.gate("recordPayment", i);
		if (denied) return denied;
		const at = this.data.packages.findIndex((p) => p.id === i.packageId);
		const found = this.data.packages[at];
		if (found === undefined) return no("not_found");
		if (found.version !== i.expectedVersion) return no("conflict");
		const next = {
			...found,
			paidBani: found.paidBani + i.amountBani,
			version: this.bump(),
		};
		this.data.packages[at] = next;
		this.data.payments.push({
			packageId: i.packageId,
			amountBani: i.amountBani,
			method: i.method,
		});
		return ok(next);
	}

	async roster(q: { personId?: string; from: string; to: string }) {
		const denied = this.gate("roster", q);
		if (denied) return denied;
		return ok(
			this.data.roster.filter(
				(r) =>
					r.date >= q.from &&
					r.date <= q.to &&
					(q.personId === undefined || r.personId === q.personId),
			),
		);
	}

	async requestLeave(i: { personId: string; from: string; to: string; kind: string }) {
		const denied = this.gate("requestLeave", i);
		if (denied) return denied;
		this.data.leaves.push(i);
		return ok(null);
	}

	async webRequests(q: { includeHandled: boolean }) {
		const denied = this.gate("webRequests", q);
		if (denied) return denied;
		return ok(this.data.requests.filter((r) => q.includeHandled || !r.handled));
	}

	async webRequest(id: string) {
		const denied = this.gate("webRequest", id);
		if (denied) return denied;
		const found = this.data.requests.find((r) => r.id === id);
		return found === undefined ? no("not_found") : ok(found);
	}

	async markRequestHandled(i: { id: string; expectedVersion: string }) {
		const denied = this.gate("markRequestHandled", i);
		if (denied) return denied;
		const at = this.data.requests.findIndex((r) => r.id === i.id);
		const found = this.data.requests[at];
		if (found === undefined) return no("not_found");
		if (found.version !== i.expectedVersion) return no("conflict");
		this.data.requests[at] = { ...found, handled: true, version: this.bump() };
		return ok(null);
	}

	async reminderTargets(date: string) {
		const denied = this.gate("reminderTargets", date);
		if (denied) return denied;
		return ok(this.data.reminders.filter((r) => r.date === date));
	}

	async sendReminder(i: {
		about: "appointment" | "payment";
		appointmentId?: string;
		clientId?: string;
		expectedVersion: string;
		channel: "email" | "whatsapp";
		text: string;
	}) {
		const denied = this.gate("sendReminder", i);
		if (denied) return denied;
		this.data.sent.push({
			appointmentId: i.appointmentId ?? i.clientId ?? "",
			channel: i.channel,
			text: i.text,
		});
		const sent: ReminderSent =
			i.channel === "whatsapp"
				? {
						channel: "whatsapp",
						link: `https://wa.me/40712000001?text=${encodeURIComponent(i.text)}`,
					}
				: { channel: "email" };
		return ok(sent);
	}

	async searchNotes(q: { text: string; clientId?: string; limit: number }) {
		const denied = this.gate("searchNotes", q);
		if (denied) return denied;
		const wanted = foldName(q.text);
		return ok(
			this.data.notes
				.filter(
					(n) =>
						foldName(n.text).includes(wanted) &&
						(q.clientId === undefined || n.clientId === q.clientId),
				)
				.slice(0, q.limit),
		);
	}

	async activity(q: { from: string; to: string; limit: number }) {
		const denied = this.gate("activity", q);
		if (denied) return denied;
		return ok(
			this.data.activity
				.filter((e) => e.at.slice(0, 10) >= q.from && e.at.slice(0, 10) <= q.to)
				.slice(0, q.limit),
		);
	}

	async bookings(q: { from: string; to: string; limit: number }) {
		const denied = this.gate("bookings", q);
		if (denied) return denied;
		return ok(
			this.data.bookings
				.filter((b) => b.createdAt.slice(0, 10) >= q.from && b.createdAt.slice(0, 10) <= q.to)
				.slice(0, q.limit),
		);
	}

	async capabilities() {
		this.calls.push({ method: "capabilities", args: [] });
		return this.permissions === null || this.down.has("capabilities")
			? no("unavailable")
			: ok({ permissions: [...this.permissions] });
	}

	async callRoute(call: { routeId: string; input: Record<string, unknown> }) {
		const denied = this.gate("callRoute", call);
		if (denied) return denied;
		if (this.denied.has(`route:${call.routeId}`)) return no("forbidden");
		return ok(this.routeAnswers.get(call.routeId) ?? { ok: true });
	}

	async createClient(input: NewClientInput) {
		const denied = this.gate("createClient", input);
		if (denied) return denied;
		const id = `c${100 + this.data.clients.length}`;
		this.data.clients.push({
			id,
			version: "cv1",
			name: input.name,
			status: "current",
			phone: input.phone ?? null,
			email: input.email ?? null,
			...(input.guardian === undefined ? {} : { guardian: input.guardian }),
			upcoming: [],
			recent: [],
		});
		return ok({ id, name: input.name });
	}

	/** The registry as this person sees it: the actions their capabilities allow, on this screen. */
	private actionsFor(page: StaffPage | undefined): Array<ActionInfo> {
		const held = baseKeys(this.permissions ?? []);
		return FAKE_ACTIONS.filter(
			(a) =>
				held.has(a.needs) &&
				(a.screens === undefined || (page !== undefined && a.screens.includes(page.screen))),
		).map(({ needs: _needs, screens: _screens, ro, ...info }) =>
			this.principal?.locale === "ro" ? { ...info, ...ro } : info,
		);
	}

	async listActions(page: StaffPage | undefined) {
		const denied = this.gate("listActions", page);
		return denied ?? ok(this.actionsFor(page));
	}

	async runAction(call: { id: string; params: Record<string, unknown> }) {
		const denied = this.gate("runAction", call);
		if (denied) return denied;
		const found = FAKE_ACTIONS.find((a) => a.id === call.id);
		if (found === undefined) return no("not_found");
		if (!baseKeys(this.permissions ?? []).has(found.needs)) return no("forbidden");
		this.data.ran.push({ id: call.id, params: call.params });
		const outcome: ActionOutcome = { summary: found.label, data: { ok: true } };
		return ok(outcome);
	}

	async stats(q: { from: string; to: string }) {
		const denied = this.gate("stats", q);
		if (denied) return denied;
		const inRange = this.data.appointments.filter((a) => a.date >= q.from && a.date <= q.to);
		const count = (status: Appointment["status"]) =>
			inRange.filter((a) => a.status === status).length;
		return ok({
			from: q.from,
			to: q.to,
			sessions: inRange.length,
			attended: count("attended"),
			noShows: count("no-show"),
			cancelled: count("cancelled"),
			unpaidClients: this.data.packages.filter((p) => p.totalBani > p.paidBani).length,
			unpaidBani: this.data.packages.reduce(
				(sum, p) => sum + Math.max(0, p.totalBani - p.paidBani),
				0,
			),
		});
	}

	async roomsAt(q: { date: string; startMin: number; durationMin: number }) {
		const denied = this.gate("roomsAt", q);
		if (denied) return denied;
		const states: Array<ResourceState> = this.data.resources
			.filter((r) => r.kind !== "person")
			.map((resource) => {
				const held = this.data.appointments.find(
					(a) =>
						a.status !== "cancelled" &&
						a.date === q.date &&
						a.resourceIds.includes(resource.id) &&
						a.startMin < q.startMin + q.durationMin &&
						q.startMin < a.startMin + a.durationMin,
				);
				return {
					resource,
					busy: held
						? {
								appointmentId: held.id,
								startMin: held.startMin,
								durationMin: held.durationMin,
								clientName: held.clientName,
							}
						: null,
				};
			});
		return ok(states);
	}

	async attention(q: { from: string; to: string; lowAt: number }) {
		const denied = this.gate("attention", q);
		if (denied) return denied;
		const out: Array<Attention> = [];
		for (const p of this.data.packages) {
			const left = p.sessions + p.bonus - p.used;
			const due = Math.max(0, p.totalBani - p.paidBani);
			if (due === 0 && left > q.lowAt) continue;
			const client = this.data.clients.find((c) => c.id === p.clientId);
			out.push({
				clientId: p.clientId,
				clientName: client?.name ?? p.clientId,
				packageId: p.id,
				packageName: p.name,
				sessionsLeft: left,
				dueBani: due,
				canEmail: (client?.email ?? null) !== null,
				canWhatsapp: (client?.phone ?? null) !== null,
				bookedInPeriod: this.data.appointments.filter(
					(a) =>
						a.clientId === p.clientId &&
						a.date >= q.from &&
						a.date <= q.to &&
						a.status !== "cancelled",
				).length,
			});
		}
		return ok(out);
	}
}
