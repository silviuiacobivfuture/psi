import type {
	Appointment as ApiAppointmentSchema,
	AuditEvent as ApiAuditSchema,
	Client as ApiClientSchema,
	Device as ApiDeviceSchema,
	Package as ApiPackageSchema,
	Payment as ApiPaymentSchema,
	Person as ApiPersonSchema,
	WebRequest as ApiRequestSchema,
	Room as ApiRoomSchema,
	RosterDay as ApiRosterSchema,
	Service as ApiServiceSchema,
} from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import type {
	Appointment,
	AuditEvent,
	Client,
	Column,
	Package,
	Payment,
	RosterEntry,
	Service,
	WebRequest,
} from "../schema";
import { auditExtras } from "./audit-detail";
import { wallOf } from "./time";

export type ApiPerson = z.output<typeof ApiPersonSchema>;
export type ApiRoom = z.output<typeof ApiRoomSchema>;
export type ApiDevice = z.output<typeof ApiDeviceSchema>;
export type ApiAppointment = z.output<typeof ApiAppointmentSchema>;
export type ApiClient = z.output<typeof ApiClientSchema>;
export type ApiPayment = z.output<typeof ApiPaymentSchema>;
export type ApiPackage = z.output<typeof ApiPackageSchema>;
export type ApiService = z.output<typeof ApiServiceSchema>;
export type ApiRequest = z.output<typeof ApiRequestSchema>;
export type ApiRoster = z.output<typeof ApiRosterSchema>;
export type ApiAudit = z.output<typeof ApiAuditSchema>;

/** The console's colours are six roles; a column takes the next one in its list. */
export const colourOf = (index: number): number => (index % 6) + 1;

export const column = (
	kind: Column["kind"],
	id: string,
	name: string,
	index: number,
	capacity?: number,
): Column => ({
	id,
	kind,
	name,
	colour: colourOf(index),
	...(capacity === undefined ? {} : { capacity }),
});

/** The console's word for an appointment's status (exhaustive: a status the service adds fails the build here). */
export function statusOf(status: ApiAppointment["status"]): Appointment["status"] {
	switch (status) {
		case "requested":
			return "requested";
		case "scheduled":
			return "confirmed";
		case "attended":
			return "attended";
		case "no_show":
			return "no-show";
		case "cancelled":
			return "cancelled";
		default:
			return status satisfies never;
	}
}

export function appointmentOf(a: ApiAppointment, tz: string): Appointment {
	const start = wallOf(a.start, tz);
	return {
		id: a.id,
		date: start.date,
		startMin: start.minutes,
		durationMin: Math.max(1, Math.round((a.end - a.start) / 60_000)),
		columnId: a.practitionerId,
		clientId: a.clientId ?? null,
		title: a.kind === "session" ? null : (a.note ?? ""),
		serviceId: a.serviceId ?? "",
		status: statusOf(a.status),
		note: a.note ?? "",
		packageId: a.packageId ?? null,
		resourceIds: [a.roomId, a.deviceId].filter((id): id is string => id !== undefined),
		priceBani: a.money?.priceCents ?? 0,
		// The service says whether it is paid, not by what means: the console only asks "paid or not" of this field.
		paidMethod: a.money?.paymentStatus === "paid" ? "cash" : null,
		remind: a.remind,
		seriesId: a.seriesId ?? null,
		cancelReason: a.cancelReason ?? null,
	};
}

/** A field group the caller may not see is absent from the answer; here it is simply empty (the screen hides it by capability). */
export function clientOf(c: ApiClient): Client {
	return {
		id: c.id,
		name: c.name,
		guardian: c.guardian?.name ?? null,
		phone: c.contact?.phone ?? null,
		email: c.contact?.email ?? null,
		status: c.status === "active" ? "current" : "archived",
		note: c.clinical?.notes ?? "",
		practitionerId: c.treating[0] ?? null,
	};
}

const said = <T extends object>(o: T): Partial<T> =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export const serviceOf = (s: ApiService): Service => ({
	id: s.id,
	name: s.name.ro,
	durationMin: s.durationMinutes,
	priceBani: s.prices?.priceCents ?? null,
	active: s.active,
	bufferMin: s.bufferMinutes,
	online: s.modes.includes("online"),
	practitionerIds: s.practitionerIds,
	...said({
		category: s.category,
		roomIds: s.roomIds,
		deviceIds: s.deviceIds,
		roomCategory: roomCategoryOf(s.roomCategory),
	}),
});

/** The console knows two room categories; any other word the service holds is not one of them. */
const roomCategoryOf = (c: string | undefined): Service["roomCategory"] =>
	c === "therapy" || c === "neuro" ? c : undefined;

/** A person as a column, with everything the service keeps about them. */
export const personColumn = (p: ApiPerson, index: number): Column => ({
	...column("person", p.id, p.displayName, index),
	active: p.active,
	bookable: p.kind === "practitioner",
	...said({
		email: p.email,
		specialty: p.specialty,
		hours: p.hours,
		roomIds: p.roomIds,
		serviceIds: p.serviceIds,
	}),
});

export const roomColumn = (r: ApiRoom, index: number): Column => ({
	...column("room", r.id, r.name, index, r.capacity),
	active: r.active,
	bookable: r.bookable ?? true,
	...said({
		category: roomCategoryOf(r.kind),
		floor: r.floor,
		purpose: r.purpose,
		homeOf: r.homePractitionerId,
	}),
});

export const deviceColumn = (d: ApiDevice, index: number): Column => ({
	...column("device", d.id, d.name, index),
	active: d.active,
	bookable: d.bookable ?? true,
	...said({ deviceType: d.deviceType, deviceRoom: d.roomId }),
});

export const paymentOf = (p: ApiPayment, tz: string): Payment => ({
	id: p.id,
	date: wallOf(p.paidAt, tz).date,
	amountBani: p.amountCents,
	method: p.method,
	// The person's name in the team, or their subject when they have left it.
	recordedBy: p.recordedByName ?? p.recordedBy,
});

/** The package with its payments (the list answer carries none; `payments` comes from the package's own read). */
export const packageOf = (p: ApiPackage, payments: ReadonlyArray<Payment> = []): Package => ({
	id: p.id,
	clientId: p.clientId,
	name: p.name,
	sessions: p.sessions,
	bonus: p.bonus,
	totalBani: p.totalCents,
	note: p.note ?? "",
	payments: [...payments],
});

export const requestOf = (r: ApiRequest): WebRequest => ({
	id: r.reference,
	receivedAt: new Date(r.createdAt).toISOString().slice(0, 19),
	name: r.contact?.name ?? "",
	phone: r.contact?.phone ?? "",
	service: r.serviceSlug ?? "",
	message: "",
	handled: r.status !== "requested",
});

export const rosterOf = (r: ApiRoster): RosterEntry => ({
	personId: r.personId,
	date: r.date,
	kind: r.kind === "leave_co" ? "leave" : r.kind === "leave_cm" ? "medical" : r.kind,
	fromMin: r.start ?? null,
	toMin: r.end ?? null,
});

export const auditOf = (e: ApiAudit): AuditEvent => ({
	id: e.id,
	at: new Date(e.at).toISOString().slice(0, 19),
	actor: e.actor.subject,
	action: e.action,
	target: `${e.target.type}:${e.target.id}`,
	targetType: e.target.type,
	targetId: e.target.id,
	...auditExtras(e.detail),
});

/** Every page of a list, up to a bound (a console shows what fits a screen, never an unbounded table). */
export async function drain<T>(
	page: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor?: string | undefined }>,
	maxPages = 20,
): Promise<T[]> {
	const out: T[] = [];
	let cursor: string | undefined;
	for (let i = 0; i < maxPages; i++) {
		const got = await page(cursor);
		out.push(...got.items);
		if (got.nextCursor === undefined) break;
		cursor = got.nextCursor;
	}
	return out;
}
