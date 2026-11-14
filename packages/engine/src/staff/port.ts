import { z } from "zod";
import {
	type ActionInfo,
	ActionInfoSchema,
	type ActionOutcome,
	ActionOutcomeSchema,
} from "./actions";
import { type StaffConfig, StaffConfigSchema, type StaffUsage } from "./assistant-config";
import type { StaffPage } from "./events";
import {
	type ActivityEvent,
	ActivityEventSchema,
	type Appointment,
	AppointmentSchema,
	type AppointmentStatus,
	type Attention,
	AttentionSchema,
	type Booking,
	BookingSchema,
	type Capabilities,
	CapabilitiesSchema,
	type ClientHit,
	ClientHitSchema,
	type ClientSummary,
	ClientSummarySchema,
	type Issue,
	IssueSchema,
	type LEAVE_KINDS,
	type NoteHit,
	NoteHitSchema,
	type PAYMENT_METHODS,
	type PackageBalance,
	PackageBalanceSchema,
	type Principal,
	PrincipalSchema,
	REMINDER_CHANNELS,
	type ReminderTarget,
	ReminderTargetSchema,
	type Resource,
	ResourceSchema,
	type ResourceState,
	ResourceStateSchema,
	type RosterEntry,
	RosterEntrySchema,
	type Service,
	ServiceSchema,
	type Slot,
	type SlotCheck,
	SlotCheckSchema,
	SlotSchema,
	type Stats,
	StatsSchema,
	type WebRequest,
	WebRequestSchema,
} from "./model";

/** Why the scheduling service said no. Every one is final for the turn: the assistant explains, never works around. */
export const REFUSAL_CODES = [
	"forbidden",
	"not_found",
	"conflict",
	"invalid",
	"unavailable",
] as const;
export type PortRefusal = (typeof REFUSAL_CODES)[number];

export type PortResult<T> = { ok: true; value: T } | { ok: false; reason: PortRefusal };

const EnvelopeSchema = z.object({
	ok: z.boolean(),
	value: z.unknown().optional(),
	reason: z.enum(REFUSAL_CODES).optional(),
});

/** What a port method answered, parsed: a malformed answer is `unavailable`, never a guess. */
export function parsePortResult<T>(value: z.ZodType<T>, raw: unknown): PortResult<T> {
	const envelope = EnvelopeSchema.safeParse(raw);
	if (!envelope.success) return { ok: false, reason: "unavailable" };
	if (!envelope.data.ok) return { ok: false, reason: envelope.data.reason ?? "unavailable" };
	const parsed = value.safeParse(envelope.data.value);
	return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "unavailable" };
}

/** The writes the assistant can propose; each is checked with `can` before a proposal exists. */
export const STAFF_ACTIONS = [
	"clients.create",
	"appointments.create",
	"appointments.move",
	"appointments.cancel",
	"attendance.mark",
	"payments.record",
	"leave.request",
	"requests.handle",
	"reminders.send",
] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];

/** `execute_start` is recorded before a confirmed change runs (no record, no write); `execute` after, with how it ended. */
export const AUDIT_PHASES = ["read", "propose", "execute_start", "execute", "refused"] as const;
export const AUDIT_OUTCOMES = ["ok", "refused", "error"] as const;

/**
 * One audited assistant call. It carries ids and counts, never a name, a note or any text from a
 * record: the service's audit log already holds the content of what changed.
 */
export const AuditEntrySchema = z.object({
	tool: z.string().min(1).max(80),
	phase: z.enum(AUDIT_PHASES),
	outcome: z.enum(AUDIT_OUTCOMES),
	subjects: z.array(z.string().max(120)).max(50),
	proposalId: z.string().max(80).optional(),
	/** Present when the call was refused: the port's code or the assistant's own. */
	reason: z.string().max(80).optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export interface FindClientsQuery {
	query: string;
	includeArchived: boolean;
	limit: number;
}
export interface AgendaQuery {
	from: string;
	to: string;
	resourceId?: string;
}
export interface FreeSlotsQuery {
	serviceId: string;
	resourceId?: string;
	from: string;
	to: string;
	limit: number;
}
export interface SlotQuery {
	date: string;
	startMin: number;
	durationMin: number;
	resourceIds: ReadonlyArray<string>;
	ignoreAppointmentId?: string;
}
/** A client to add: only the fields the person gave. */
export interface NewClientInput {
	name: string;
	phone?: string;
	email?: string;
	guardian?: string;
	/** The year they were born; an age said aloud is turned into this by the tool. */
	birthYear?: number;
}
export const CreatedClientSchema = z.object({
	id: z.string().min(1).max(120),
	name: z.string(),
});
export type CreatedClient = z.infer<typeof CreatedClientSchema>;
export interface NewAppointmentInput {
	clientId: string;
	serviceId: string;
	date: string;
	startMin: number;
	durationMin: number;
	resourceIds: ReadonlyArray<string>;
}
export interface MoveInput {
	id: string;
	expectedVersion: string;
	date: string;
	startMin: number;
	resourceIds: ReadonlyArray<string>;
}
export interface PaymentInput {
	clientId: string;
	packageId: string;
	expectedVersion: string;
	amountBani: number;
	method: (typeof PAYMENT_METHODS)[number];
}
export interface LeaveInput {
	personId: string;
	from: string;
	to: string;
	kind: (typeof LEAVE_KINDS)[number];
}
export interface ReminderInput {
	/** A reminder about one appointment, or a notice about a balance due (then `clientId`). */
	about: "appointment" | "payment";
	appointmentId?: string;
	clientId?: string;
	expectedVersion: string;
	channel: (typeof REMINDER_CHANNELS)[number];
	text: string;
}
export const ReminderSentSchema = z.object({
	channel: z.enum(REMINDER_CHANNELS),
	/** A WhatsApp reminder is a prepared link the person opens; an e-mail is sent by the service. */
	link: z.string().url().max(2000).optional(),
});
export type ReminderSent = z.infer<typeof ReminderSentSchema>;

/**
 * Everything the staff assistant reads and writes. The console implements it with
 * `@psi/scheduling-sdk` called WITH THE SIGNED-IN PERSON'S TOKEN, so the service's authorization
 * (OpenFGA) answers every call and the assistant can never exceed that person's permissions.
 * A port is made per request; it is never shared between people.
 */
export interface StaffPort {
	/** Who is signed in. A failure means no run: the assistant refuses to start without it. */
	whoami(): Promise<PortResult<Principal>>;
	/** Whether the person may do a write, asked before a proposal is shown. */
	can(action: StaffAction, subjectId?: string): Promise<PortResult<boolean>>;
	/** Records one assistant call. */
	audit(entry: AuditEntry): Promise<PortResult<null>>;
	resources(): Promise<PortResult<ReadonlyArray<Resource>>>;
	services(): Promise<PortResult<ReadonlyArray<Service>>>;
	findClients(query: FindClientsQuery): Promise<PortResult<ReadonlyArray<ClientHit>>>;
	clientSummary(clientId: string): Promise<PortResult<ClientSummary>>;
	agenda(query: AgendaQuery): Promise<PortResult<ReadonlyArray<Appointment>>>;
	appointment(id: string): Promise<PortResult<Appointment>>;
	freeSlots(query: FreeSlotsQuery): Promise<PortResult<ReadonlyArray<Slot>>>;
	checkSlot(query: SlotQuery): Promise<PortResult<SlotCheck>>;
	createAppointment(input: NewAppointmentInput): Promise<PortResult<Appointment>>;
	moveAppointment(input: MoveInput): Promise<PortResult<Appointment>>;
	cancelAppointment(input: { id: string; expectedVersion: string }): Promise<PortResult<null>>;
	markAttendance(input: {
		id: string;
		expectedVersion: string;
		status: Extract<AppointmentStatus, "attended" | "no-show">;
	}): Promise<PortResult<Appointment>>;
	packages(clientId: string): Promise<PortResult<ReadonlyArray<PackageBalance>>>;
	recordPayment(input: PaymentInput): Promise<PortResult<PackageBalance>>;
	roster(query: {
		personId?: string;
		from: string;
		to: string;
	}): Promise<PortResult<ReadonlyArray<RosterEntry>>>;
	requestLeave(input: LeaveInput): Promise<PortResult<null>>;
	webRequests(query: { includeHandled: boolean }): Promise<PortResult<ReadonlyArray<WebRequest>>>;
	webRequest(id: string): Promise<PortResult<WebRequest>>;
	markRequestHandled(input: { id: string; expectedVersion: string }): Promise<PortResult<null>>;
	reminderTargets(date: string): Promise<PortResult<ReadonlyArray<ReminderTarget>>>;
	sendReminder(input: ReminderInput): Promise<PortResult<ReminderSent>>;
	searchNotes(query: {
		text: string;
		clientId?: string;
		limit: number;
	}): Promise<PortResult<ReadonlyArray<NoteHit>>>;
	stats(query: { from: string; to: string }): Promise<PortResult<Stats>>;
	/** Every room and device at a time: free, or held by whom. Feeds the floor plan too. */
	roomsAt(query: {
		date: string;
		startMin: number;
		durationMin: number;
	}): Promise<PortResult<ReadonlyArray<ResourceState>>>;
	/** What happened in a period, from the audit log and the change feed. */
	activity(query: {
		from: string;
		to: string;
		limit: number;
	}): Promise<PortResult<ReadonlyArray<ActivityEvent>>>;
	/** Bookings made in a period, with their source. */
	bookings(query: {
		from: string;
		to: string;
		limit: number;
	}): Promise<PortResult<ReadonlyArray<Booking>>>;
	/** What governs this person's next turn (the service's merged configuration and their meters). */
	assistant(): Promise<PortResult<StaffConfig>>;
	/** Adds what one of this person's turns used to the meters; answers a limit that now stops the next one. */
	recordUsage(usage: StaffUsage): Promise<PortResult<{ stop?: string | undefined }>>;
	/** What the person may do here (the service's `/v1/apps/:app/me`): tools beyond it are not offered at all. */
	capabilities(): Promise<PortResult<Capabilities>>;
	/**
	 * Any route of the scheduling service by its id (`clients.archive`), with the person's own
	 * token: the generated parity tools call this. The service's authorization answers.
	 */
	callRoute(call: {
		routeId: string;
		input: Record<string, unknown>;
	}): Promise<PortResult<unknown>>;
	/** Adds a client; the service's own permission check answers. */
	createClient(input: NewClientInput): Promise<PortResult<CreatedClient>>;
	/**
	 * What this person can do on this screen or record, from the console's action registry: only
	 * what they hold the capability for is listed, so an action not listed is one they may not do.
	 * Without a page: everything they may do on any screen (what discovery lists).
	 */
	listActions(page: StaffPage | undefined): Promise<PortResult<ReadonlyArray<ActionInfo>>>;
	/** Runs a listed action as the person (the registry checks again); a write is only ever run after the person confirmed it. */
	runAction(call: {
		id: string;
		params: Record<string, unknown>;
	}): Promise<PortResult<ActionOutcome>>;
	/** Clients with a balance due or a package running out, with how many sessions they have booked in the period. */
	attention(query: {
		from: string;
		to: string;
		lowAt: number;
	}): Promise<PortResult<ReadonlyArray<Attention>>>;
}

/** The schema of the value each port method returns. */
export const PORT_VALUES = {
	whoami: PrincipalSchema,
	can: z.boolean(),
	audit: z.null(),
	resources: z.array(ResourceSchema).readonly(),
	services: z.array(ServiceSchema).readonly(),
	findClients: z.array(ClientHitSchema).readonly(),
	clientSummary: ClientSummarySchema,
	agenda: z.array(AppointmentSchema).readonly(),
	appointment: AppointmentSchema,
	freeSlots: z.array(SlotSchema).readonly(),
	checkSlot: SlotCheckSchema,
	packages: z.array(PackageBalanceSchema).readonly(),
	payment: PackageBalanceSchema,
	roster: z.array(RosterEntrySchema).readonly(),
	nothing: z.null(),
	webRequests: z.array(WebRequestSchema).readonly(),
	webRequest: WebRequestSchema,
	reminderTargets: z.array(ReminderTargetSchema).readonly(),
	reminderSent: ReminderSentSchema,
	notes: z.array(NoteHitSchema).readonly(),
	stats: StatsSchema,
	roomsAt: z.array(ResourceStateSchema).readonly(),
	attention: z.array(AttentionSchema).readonly(),
	activity: z.array(ActivityEventSchema).readonly(),
	bookings: z.array(BookingSchema).readonly(),
	capabilities: CapabilitiesSchema,
	assistant: StaffConfigSchema,
	usageRecorded: z.object({ stop: z.string().optional() }),
	route: z.unknown(),
	createdClient: CreatedClientSchema,
	actions: z.array(ActionInfoSchema).readonly(),
	actionOutcome: ActionOutcomeSchema,
} as const;

/**
 * Visitor-facing trouble on the sites, from the estate's log store. The console server holds the
 * read token behind this port; the browser never sees it. Aggregates only.
 */
export interface IssuesPort {
	issues(query: { from: string; to: string }): Promise<PortResult<ReadonlyArray<Issue>>>;
}

export const ISSUES_VALUE = z.array(IssueSchema).readonly();
