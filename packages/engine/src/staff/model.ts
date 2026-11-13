import { z } from "zod";

/**
 * What the staff assistant knows about the clinic, as the scheduling service's data shapes. The
 * console implements `StaffPort` over the SDK with the signed-in person's token, so every shape
 * here is only what that person may see: a field the API did not return is absent, never guessed.
 * Dates are the clinic's local calendar days; times are minutes after local midnight; money is
 * integer bani (no floating point near a ledger).
 */

export const IdSchema = z.string().min(1).max(120);
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const MinuteSchema = z.number().int().min(0).max(1440);
export const BaniSchema = z.number().int().nonnegative();
export const VersionSchema = z.string().min(1).max(200);

export const LOCALES = ["ro", "en"] as const;
export const StaffLocaleSchema = z.enum(LOCALES);
export type StaffLocale = z.infer<typeof StaffLocaleSchema>;

/** The verified person behind a run: the port's `whoami`, from the token they signed in with. */
export const PrincipalSchema = z.object({
	sub: IdSchema,
	name: z.string().min(1).max(200),
	appId: IdSchema,
	appName: z.string().min(1).max(200),
	roles: z.array(z.string().max(120)).max(50),
	locale: StaffLocaleSchema,
	/** Their own entry in the roster and calendar columns, when they have one (leave requests). */
	personId: IdSchema.optional(),
});
export type Principal = z.infer<typeof PrincipalSchema>;

export const RESOURCE_KINDS = ["person", "room", "device", "group"] as const;
export const ResourceSchema = z.object({
	id: IdSchema,
	kind: z.enum(RESOURCE_KINDS),
	name: z.string().min(1).max(200),
	/** What a room or device offers ("nfb", "kinetotherapy", "group"): configured by the team. */
	equipment: z.array(z.string().max(60)).max(20).optional(),
});
export type Resource = z.infer<typeof ResourceSchema>;

export const ServiceSchema = z.object({
	id: IdSchema,
	name: z.string().min(1).max(200),
	durationMin: z.number().int().positive().max(600),
	priceBani: BaniSchema,
});
export type Service = z.infer<typeof ServiceSchema>;

export const APPOINTMENT_STATUSES = [
	"requested",
	"confirmed",
	"attended",
	"no-show",
	"cancelled",
] as const;
export const AppointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

export const AppointmentSchema = z.object({
	id: IdSchema,
	/** Changes with every write: the proposal's guard against a stale confirmation. */
	version: VersionSchema,
	date: DateSchema,
	startMin: MinuteSchema,
	durationMin: z.number().int().positive().max(1440),
	resourceIds: z.array(IdSchema).max(10),
	clientId: IdSchema.nullable(),
	/** Free text from a record: always shown to the model as fenced data. */
	clientName: z.string().max(300).nullable(),
	/** A group activity's title (it has no client). */
	title: z.string().max(300).nullable(),
	serviceId: IdSchema,
	status: AppointmentStatusSchema,
	note: z.string().max(2000).optional(),
});
export type Appointment = z.infer<typeof AppointmentSchema>;

export const ClientHitSchema = z.object({
	id: IdSchema,
	name: z.string().max(300),
	status: z.enum(["current", "archived"]),
	phone: z.string().max(60).nullable().optional(),
});
export type ClientHit = z.infer<typeof ClientHitSchema>;

export const PackageBalanceSchema = z.object({
	id: IdSchema,
	clientId: IdSchema,
	version: VersionSchema,
	name: z.string().max(300),
	sessions: z.number().int().nonnegative(),
	bonus: z.number().int().nonnegative(),
	used: z.number().int().nonnegative(),
	totalBani: BaniSchema,
	paidBani: BaniSchema,
});
export type PackageBalance = z.infer<typeof PackageBalanceSchema>;

/** A client as far as the signed-in person may see: contact, guardian and clinical only when returned. */
export const ClientSummarySchema = z.object({
	id: IdSchema,
	version: VersionSchema,
	name: z.string().max(300),
	status: z.enum(["current", "archived"]),
	phone: z.string().max(60).nullable().optional(),
	email: z.string().max(200).nullable().optional(),
	guardian: z.string().max(300).nullable().optional(),
	practitionerId: IdSchema.nullable().optional(),
	note: z.string().max(4000).optional(),
	clinical: z
		.object({
			diagnosis: z.string().max(2000).nullable().optional(),
			lastReportDate: DateSchema.nullable().optional(),
		})
		.optional(),
	upcoming: z.array(AppointmentSchema).max(50),
	recent: z.array(AppointmentSchema).max(50),
	packages: z.array(PackageBalanceSchema).max(50).optional(),
});
export type ClientSummary = z.infer<typeof ClientSummarySchema>;

export const SlotSchema = z.object({
	date: DateSchema,
	startMin: MinuteSchema,
	durationMin: z.number().int().positive().max(1440),
	resourceIds: z.array(IdSchema).max(10),
});
export type Slot = z.infer<typeof SlotSchema>;

export const SlotCheckSchema = z.object({
	free: z.boolean(),
	/** The resources that are taken at that time (ids only: nothing about who holds them). */
	busyResourceIds: z.array(IdSchema).max(10),
});
export type SlotCheck = z.infer<typeof SlotCheckSchema>;

export const ROSTER_KINDS = ["work", "leave", "medical", "free"] as const;
export const RosterEntrySchema = z.object({
	personId: IdSchema,
	date: DateSchema,
	kind: z.enum(ROSTER_KINDS),
	fromMin: MinuteSchema.nullable(),
	toMin: MinuteSchema.nullable(),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

export const WebRequestSchema = z.object({
	id: IdSchema,
	version: VersionSchema,
	receivedAt: z.string().max(40),
	name: z.string().max(300),
	phone: z.string().max(60),
	service: z.string().max(300),
	/** Written by a stranger on the website: the likeliest place for an injected instruction. */
	message: z.string().max(5000),
	handled: z.boolean(),
});
export type WebRequest = z.infer<typeof WebRequestSchema>;

export const ReminderTargetSchema = z.object({
	appointmentId: IdSchema,
	version: VersionSchema,
	clientName: z.string().max(300),
	phone: z.string().max(60).nullable(),
	email: z.string().max(200).nullable(),
	date: DateSchema,
	startMin: MinuteSchema,
	resourceName: z.string().max(200),
	sent: z.boolean(),
});
export type ReminderTarget = z.infer<typeof ReminderTargetSchema>;

export const NoteHitSchema = z.object({
	id: IdSchema,
	clientId: IdSchema.nullable(),
	date: DateSchema,
	text: z.string().max(5000),
});
export type NoteHit = z.infer<typeof NoteHitSchema>;

export const StatsSchema = z.object({
	from: DateSchema,
	to: DateSchema,
	sessions: z.number().int().nonnegative(),
	attended: z.number().int().nonnegative(),
	noShows: z.number().int().nonnegative(),
	cancelled: z.number().int().nonnegative(),
	unpaidClients: z.number().int().nonnegative(),
	unpaidBani: BaniSchema,
});
export type Stats = z.infer<typeof StatsSchema>;

export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;
export const REMINDER_CHANNELS = ["email", "whatsapp"] as const;
export const LEAVE_KINDS = ["leave", "medical"] as const;

/** A room or device at one time: free, or held by an appointment. */
export const ResourceStateSchema = z.object({
	resource: ResourceSchema,
	busy: z
		.object({
			appointmentId: IdSchema,
			startMin: MinuteSchema,
			durationMin: z.number().int().positive().max(1440),
			clientName: z.string().max(300).nullable(),
		})
		.nullable(),
});
export type ResourceState = z.infer<typeof ResourceStateSchema>;

/** A client with something to act on: a balance due, or a package running out. */
export const AttentionSchema = z.object({
	clientId: IdSchema,
	clientName: z.string().max(300),
	packageId: IdSchema,
	packageName: z.string().max(300),
	sessionsLeft: z.number().int(),
	dueBani: BaniSchema,
	/** Sessions of this client still booked from today to the end of the asked period. */
	bookedInPeriod: z.number().int().nonnegative(),
	/** Whether the service holds an address / a phone number to send a notice to. */
	canEmail: z.boolean(),
	canWhatsapp: z.boolean(),
});
export type Attention = z.infer<typeof AttentionSchema>;
