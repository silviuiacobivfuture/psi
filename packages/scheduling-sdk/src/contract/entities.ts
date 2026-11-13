import { z } from "zod/v4";
import { BlacklistOverride } from "./entities-blacklist";
import { ClientNote } from "./entities-notes";
import { AppId, DateKey, FieldGroup, Id, Label, Locale, Money, Ms, Subject } from "./primitives";

export * from "./entities-blacklist";
export * from "./entities-files";
export * from "./entities-money";
export * from "./entities-notes";

const Stamps = { createdAt: Ms, updatedAt: Ms };
const Name = z.string().trim().min(1).max(200);
const Phone = z.string().trim().min(3).max(40);
const Email = z.string().trim().max(200).pipe(z.email());

export const AppStatus = z.enum(["active", "suspended"]);
export const App = z.object({
	id: AppId,
	name: Name,
	timeZone: z.string().min(1).max(60),
	status: AppStatus,
	...Stamps,
});
export const AppCreate = z.object({
	id: AppId,
	name: Name,
	timeZone: z.string().min(1).max(60),
	ownerSubject: Subject,
});
export const AppPatch = z.object({
	name: Name.optional(),
	timeZone: z.string().min(1).max(60).optional(),
	status: AppStatus.optional(),
});

export const Member = z.object({
	subject: Subject,
	displayName: Name,
	email: z.string().max(200).optional(),
	roles: z.array(Id),
	/** People whose calendars this member coordinates (the `assigned` scope). */
	coordinates: z.array(Id),
	...Stamps,
});
export const MemberPut = z.object({
	displayName: Name,
	email: Email.optional(),
	roles: z.array(Id).max(20),
	coordinates: z.array(Id).max(100).default([]),
});
/** Individual grants (OpenFGA tuples) and denials (enforced by the service on top of Check) per person. */
export const Overrides = z.object({
	grant: z.array(z.string().min(1).max(120)).max(300),
	deny: z.array(z.string().min(1).max(120)).max(300),
});

export const Role = z.object({
	id: Id,
	name: Name,
	description: z.string().max(500).optional(),
	system: z.boolean(),
	permissions: z.array(z.string()),
	...Stamps,
});
export const RoleCreate = z.object({
	name: Name,
	description: z.string().max(500).optional(),
	copyFrom: Id.optional(),
});
export const RolePatch = z.object({
	name: Name.optional(),
	description: z.string().max(500).optional(),
});
export const RolePermissions = z.object({
	permissions: z.array(z.string().min(1).max(120)).max(600),
});
export const MatrixRow = z.object({
	key: z.string(),
	resource: z.string(),
	action: z.string(),
	effect: z.enum(["read", "write"]),
	fieldGroup: FieldGroup.optional(),
	name: Label,
	/** False: the catalogue defines only the `all` scope for it (nothing narrower to choose). */
	scoped: z.boolean(),
	scopes: z.array(z.enum(["all", "assigned", "own"])),
	held: z.array(z.enum(["all", "assigned", "own"])),
});

export const PersonKind = z.enum(["practitioner", "reception", "volunteer", "staff"]);
export const Person = z.object({
	id: Id,
	displayName: Name,
	kind: PersonKind,
	subject: Subject.optional(),
	active: z.boolean(),
	external: z.boolean(),
	color: z.string().max(20).optional(),
	...Stamps,
});
export const PersonCreate = z.object({
	displayName: Name,
	kind: PersonKind,
	subject: Subject.optional(),
	external: z.boolean().optional(),
	color: z.string().max(20).optional(),
});
export const PersonPatch = PersonCreate.partial().extend({ active: z.boolean().optional() });

export const Room = z.object({
	id: Id,
	name: Name,
	kind: z.string().max(40),
	capacity: z.number().int().min(1).max(200).optional(),
	active: z.boolean(),
	...Stamps,
});
export const RoomCreate = z.object({
	name: Name,
	kind: z.string().max(40),
	capacity: z.number().int().min(1).max(200).optional(),
});
export const RoomPatch = RoomCreate.partial().extend({ active: z.boolean().optional() });
export const Device = z.object({
	id: Id,
	name: Name,
	roomId: Id.optional(),
	active: z.boolean(),
	...Stamps,
});
export const DeviceCreate = z.object({ name: Name, roomId: Id.optional() });
export const DevicePatch = DeviceCreate.partial().extend({ active: z.boolean().optional() });
export const Group = z.object({
	id: Id,
	name: Name,
	kind: z.enum(["group", "atelier"]),
	clientIds: z.array(Id),
	active: z.boolean(),
	...Stamps,
});
export const GroupCreate = z.object({
	name: Name,
	kind: z.enum(["group", "atelier"]),
	clientIds: z.array(Id).max(200).optional(),
});
export const GroupPatch = GroupCreate.partial().extend({ active: z.boolean().optional() });

/** `prices` is a field group of its own: absent unless the caller may see prices. */
export const Prices = z.object({ priceCents: Money, currency: z.string().length(3) });
export const Service = z.object({
	id: Id,
	slug: AppId,
	name: Label,
	durationMinutes: z.number().int().min(5).max(480),
	bufferMinutes: z.number().int().min(0).max(240),
	modes: z.array(z.enum(["onsite", "online"])).min(1),
	practitionerIds: z.array(Id),
	active: z.boolean(),
	prices: Prices.optional(),
	...Stamps,
});
const ServiceBase = z.object({
	slug: AppId,
	name: Label,
	durationMinutes: z.number().int().min(5).max(480),
	bufferMinutes: z.number().int().min(0).max(240),
	modes: z.array(z.enum(["onsite", "online"])).min(1),
	practitionerIds: z.array(Id).max(100),
});
export const ServiceCreate = ServiceBase.extend({
	bufferMinutes: ServiceBase.shape.bufferMinutes.default(0),
	practitionerIds: ServiceBase.shape.practitionerIds.default([]),
});
// A patch carries no defaults: an absent field is left alone, never reset.
export const ServicePatch = ServiceBase.omit({ slug: true })
	.partial()
	.extend({ active: z.boolean().optional() });
export const ServicePrice = Prices;

export const ClientStatus = z.enum(["active", "archived", "deleted"]);
export const ContactData = z.object({
	phone: Phone.optional(),
	email: Email.optional(),
	address: z.string().max(300).optional(),
});
export const GuardianData = z.object({
	name: Name,
	phone: Phone.optional(),
	email: Email.optional(),
	relationship: z.string().max(60).optional(),
});
export const MoneyData = z.object({
	tariffCents: Money.optional(),
	discountPercent: z.number().min(0).max(100).optional(),
	billingName: z.string().max(200).optional(),
});
export const ClinicalData = z.object({
	diagnosis: z.string().max(4000).optional(),
	notes: z.string().max(20_000).optional(),
});
/** A client: identity always; each field group present only for a caller who may see it. */
export const Client = z.object({
	id: Id,
	name: Name,
	status: ClientStatus,
	treating: z.array(Id),
	birthYear: z.number().int().min(1900).max(2100).optional(),
	archivedAt: Ms.optional(),
	deletedAt: Ms.optional(),
	purgeAt: Ms.optional(),
	contact: ContactData.optional(),
	guardian: GuardianData.optional(),
	money: MoneyData.optional(),
	clinical: ClinicalData.optional(),
	/**
	 * The client's summary: their pinned notes, newest pin first, only on a single read (`clients.get`) and only those the
	 * caller may read (a clinical note needs the clinical group of the notes permission).
	 */
	pinnedNotes: z.array(ClientNote).optional(),
	...Stamps,
});
export const ClientCreate = z.object({
	name: Name,
	birthYear: z.number().int().min(1900).max(2100).optional(),
	treating: z.array(Id).max(20).optional(),
	contact: ContactData.optional(),
	guardian: GuardianData.optional(),
	money: MoneyData.optional(),
	clinical: ClinicalData.optional(),
});
export const ClientPatch = ClientCreate.omit({ treating: true }).partial();
export const ClientTreating = z.object({
	treating: z.array(Id).max(20),
	reason: z.string().trim().min(3).max(300),
});

export const AppointmentKind = z.enum(["session", "block", "group"]);
/**
 * `requested`: booked by the team but waiting for the client to confirm; it holds the time like a confirmed one does,
 * takes no attendance and no reminder, and `appointments.confirm` turns it into `scheduled`.
 */
export const AppointmentStatus = z.enum([
	"requested",
	"scheduled",
	"attended",
	"no_show",
	"cancelled",
]);
export const AppointmentMoney = z.object({
	priceCents: Money,
	paidCents: Money,
	paymentStatus: z.enum(["unpaid", "partial", "paid", "package"]),
});
export const Appointment = z.object({
	id: Id,
	kind: AppointmentKind,
	status: AppointmentStatus,
	practitionerId: Id,
	clientId: Id.optional(),
	groupId: Id.optional(),
	roomId: Id.optional(),
	deviceId: Id.optional(),
	serviceId: Id.optional(),
	packageId: Id.optional(),
	start: Ms,
	end: Ms,
	note: z.string().max(500).optional(),
	/** The day-before reminder is sent for this one (the default); false leaves it off the reminder list. */
	remind: z.boolean(),
	/** The weekly series it is one of (see `series.create`); absent for one that stands alone. */
	seriesId: Id.optional(),
	cancelReason: z.string().max(300).optional(),
	money: AppointmentMoney.optional(),
	/** Set on a soft-deleted appointment; it is listed nowhere and `restore` brings it back until `purgeAt`. */
	deletedAt: Ms.optional(),
	purgeAt: Ms.optional(),
	...Stamps,
});
export const AppointmentCreate = z.object({
	kind: AppointmentKind.default("session"),
	practitionerId: Id,
	clientId: Id.optional(),
	groupId: Id.optional(),
	roomId: Id.optional(),
	deviceId: Id.optional(),
	serviceId: Id.optional(),
	packageId: Id.optional(),
	start: Ms,
	end: Ms,
	note: z.string().max(500).optional(),
	priceCents: Money.optional(),
	/** `requested` books it without confirming it (see `AppointmentStatus`). */
	status: z.enum(["scheduled", "requested"]).default("scheduled"),
	remind: z.boolean().default(true),
	override: BlacklistOverride.optional(),
});
/**
 * Every field optional, only what is present changes. `packageId: null` takes the appointment out of its package.
 * `clientId` moves it to another client (whose blacklist standing is checked, and whose package it must then be drawn
 * from or none), `serviceId` and `remind` are plain changes, and `priceCents` is a change of the money group.
 */
export const AppointmentPatch = z.object({
	clientId: Id.optional(),
	serviceId: Id.optional(),
	packageId: Id.nullable().optional(),
	practitionerId: Id.optional(),
	roomId: Id.optional(),
	deviceId: Id.optional(),
	start: Ms.optional(),
	end: Ms.optional(),
	note: z.string().max(500).optional(),
	priceCents: Money.optional(),
	remind: z.boolean().optional(),
	override: BlacklistOverride.optional(),
});
export const AppointmentCancel = z.object({ reason: z.string().trim().min(2).max(300) });
export const Attendance = z.object({ status: z.enum(["attended", "no_show", "scheduled"]) });
export const AppointmentPayment = z.object({
	amountCents: Money.min(1),
	method: z.enum(["cash", "card", "transfer"]),
});

export const RosterKind = z.enum(["work", "leave_co", "leave_cm", "free"]);
export const RosterDay = z.object({
	id: Id,
	personId: Id,
	date: DateKey,
	kind: RosterKind,
	start: z.number().int().min(0).max(1440).optional(),
	end: z.number().int().min(0).max(1440).optional(),
	...Stamps,
});
export const RosterPut = z.object({
	kind: RosterKind,
	start: z.number().int().min(0).max(1440).optional(),
	end: z.number().int().min(0).max(1440).optional(),
});
export const Leave = z.object({
	id: Id,
	personId: Id,
	from: DateKey,
	to: DateKey,
	kind: z.enum(["co", "cm"]),
	status: z.enum(["pending", "approved", "rejected"]),
	decidedBy: Subject.optional(),
	...Stamps,
});
export const LeaveCreate = z.object({
	personId: Id,
	from: DateKey,
	to: DateKey,
	kind: z.enum(["co", "cm"]),
});
export const LeaveDecision = z.object({ decision: z.enum(["approved", "rejected"]) });

export const ReminderState = z.enum(["pending", "sent", "confirmed"]);
/** Tomorrow's list: the contact appears only for a caller who may see contact data. */
export const Reminder = z.object({
	appointmentId: Id,
	clientId: Id.optional(),
	clientName: z.string().optional(),
	start: Ms,
	state: ReminderState,
	contact: ContactData.optional(),
});
export const ReminderMark = z.object({ state: z.enum(["sent", "confirmed"]) });
export const ReminderEmail = z.object({ locale: Locale.default("ro") });
export const WhatsappLink = z.object({ url: z.string().url(), text: z.string() });

/** `handled`: a callback request the team has called back (a booking is confirmed, declined or cancelled instead). */
export const RequestStatus = z.enum(["requested", "confirmed", "declined", "cancelled", "handled"]);
export const WebRequest = z.object({
	reference: z.string(),
	status: RequestStatus,
	start: Ms.optional(),
	end: Ms.optional(),
	serviceSlug: z.string().optional(),
	createdAt: Ms,
	contact: z
		.object({ name: z.string(), phone: z.string().optional(), email: z.string().optional() })
		.optional(),
});
export const RequestDecision = z.object({
	/** `handle` is for a callback request only: it was called back. */
	decision: z.enum(["confirm", "decline", "cancel", "handle"]),
	reason: z.string().max(60).optional(),
});

export const RecordSummary = z.object({
	id: Id,
	clientId: Id,
	formId: Id,
	formVersion: z.number().int().min(1),
	appointmentId: Id.optional(),
	authorSubject: Subject,
	...Stamps,
});
/** A record: its clinical content is decrypted for a permitted caller and ABSENT for everyone else. */
export const RecordFull = RecordSummary.extend({
	data: z.record(z.string(), z.unknown()).optional(),
});
export const RecordCreate = z.object({
	formId: Id,
	appointmentId: Id.optional(),
	data: z.record(z.string(), z.unknown()),
});
export const RecordPatch = z.object({ data: z.record(z.string(), z.unknown()) });

export const AuditEvent = z.object({
	id: Id,
	at: Ms,
	actor: z.object({ subject: Subject, kind: z.enum(["person", "service"]) }),
	action: z.string(),
	target: z.object({ type: z.string(), id: z.string() }),
	detail: z.record(z.string(), z.unknown()).optional(),
});
export const AuditQuery = z.object({
	action: z.string().max(80).optional(),
	from: z.coerce.number().int().optional(),
	to: z.coerce.number().int().optional(),
});

export const DEFINITION_KINDS = ["fields", "forms", "views", "actions", "catalogues"] as const;
export const DefinitionKind = z.enum(DEFINITION_KINDS);
/** Builder definitions: data, versioned, validated; they can never widen a permission. */
export const Definition = z.object({
	id: Id,
	kind: DefinitionKind,
	version: z.number().int().min(1),
	name: Label,
	body: z.record(z.string(), z.unknown()),
	...Stamps,
});
export const DefinitionPut = z.object({ name: Label, body: z.record(z.string(), z.unknown()) });

export const ImportRun = z.object({
	id: Id,
	source: z.string(),
	status: z.enum(["running", "dry_run", "done", "failed"]),
	counts: z.record(z.string(), z.number().int()),
	startedAt: Ms,
	finishedAt: Ms.optional(),
});

export const CalendarColumn = z.enum(["person", "room", "device"]);
export const CalendarQuery = z.object({
	from: z.coerce.number().int().nonnegative(),
	to: z.coerce.number().int().nonnegative(),
	columns: CalendarColumn.default("person"),
});
export const CalendarResult = z.object({
	columns: z.array(z.object({ id: Id, name: z.string(), appointments: z.array(Appointment) })),
});
export const CalendarEvent = z.object({
	seq: z.number().int().nonnegative(),
	at: Ms,
	kind: z.enum(["appointment", "client", "roster", "request", "ready"]),
	op: z.enum(["created", "updated", "deleted", "ready"]),
	id: z.string(),
});

/** The inbox badge: what is waiting. `reminders` is absent for a caller who may not see reminders. */
export const InboxCounts = z.object({
	seq: z.number().int().nonnegative(),
	at: Ms,
	requests: z.number().int().nonnegative(),
	reminders: z.number().int().nonnegative().optional(),
});
