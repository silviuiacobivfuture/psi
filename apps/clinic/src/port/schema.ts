import { ROOM_CATEGORIES } from "@psi/scheduling/clinic";
import { STATUSES } from "@psi/ui/admin";
import { z } from "zod";

export const AppSlugSchema = z.enum(["psizone", "hemisync"]);
export type AppSlug = z.infer<typeof AppSlugSchema>;

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Minutes after midnight, clinic local time. */
export const MinuteSchema = z.number().int().min(0).max(1440);

export const StatusSchema = z.enum(STATUSES);

export const ClientFilterSchema = z.enum(["current", "archived"]);

export const RoomCategorySchema = z.enum(ROOM_CATEGORIES);
export type RoomCategoryName = z.infer<typeof RoomCategorySchema>;

export const ColumnKindSchema = z.enum(["person", "device", "room", "group"]);
export const ColumnSchema = z.object({
	id: z.string(),
	kind: ColumnKindSchema,
	name: z.string(),
	/** 1..6: the calendar column colour role. */
	colour: z.number().int().min(1).max(6),
	/** How many people a room or group holds, when the service says. */
	capacity: z.number().int().positive().optional(),
	/** Rooms: the category they belong to (therapy, or neuro-assessment and neurofeedback). */
	category: RoomCategorySchema.optional(),
	/** Rooms: the floor they are on, by the plan's floor id. */
	floor: z.string().optional(),
	/** Rooms: what the room is for, as the clinic names it ("Psihoterapie", "Cabinet ILF"). */
	purpose: z.string().optional(),
	/** Rooms that are one practitioner's own: the practitioner's column id ("cabinetul Irinei"). */
	homeOf: z.string().optional(),
	/** Off the calendar and the pickers, kept for history. Absent: active. */
	active: z.boolean().optional(),
	/** People: where to reach them, what they are known for, their hours per weekday (Monday first), what they use and offer. */
	email: z.string().optional(),
	specialty: z.string().optional(),
	hours: z
		.array(z.object({ from: MinuteSchema, to: MinuteSchema }).nullable())
		.length(7)
		.optional(),
	roles: z.array(z.string()).optional(),
	roomIds: z.array(z.string()).optional(),
	serviceIds: z.array(z.string()).optional(),
	/** Rooms and devices: may a booking use it. Absent: yes. */
	bookable: z.boolean().optional(),
	/** Devices: what kind (NFB, QEEG, other) and the room it stands in. */
	deviceType: z.string().optional(),
	deviceRoom: z.string().optional(),
});
export type Column = z.infer<typeof ColumnSchema>;

export const ServiceSchema = z.object({
	id: z.string(),
	name: z.string(),
	durationMin: z.number().int().positive(),
	/** Null: the person may not see prices (a field group the service leaves out). */
	priceBani: z.number().int().nonnegative().nullable(),
	/** Booked only in a room of this category (neurofeedback and QEEG need a neuro room). */
	roomCategory: RoomCategorySchema.optional(),
	active: z.boolean().optional(),
	/** Minutes kept free after it. */
	bufferMin: z.number().int().min(0).max(240).optional(),
	/** Offered for online booking. Absent: yes. */
	online: z.boolean().optional(),
	/** What the service is filed under in the clinic's own words. */
	category: z.string().optional(),
	/** Who may give it, where, and with what; empty: anyone, anywhere. */
	practitionerIds: z.array(z.string()).optional(),
	roomIds: z.array(z.string()).optional(),
	deviceIds: z.array(z.string()).optional(),
});
export type Service = z.infer<typeof ServiceSchema>;

export const ClientSchema = z.object({
	id: z.string(),
	name: z.string(),
	guardian: z.string().nullable(),
	phone: z.string().nullable(),
	email: z.string().nullable(),
	status: z.enum(["current", "archived"]),
	note: z.string(),
	practitionerId: z.string().nullable(),
	/** The year they were born, when it was recorded. */
	birthYear: z.number().int().optional(),
});
export type Client = z.infer<typeof ClientSchema>;

export const AppointmentSchema = z.object({
	id: z.string(),
	date: IsoDateSchema,
	startMin: MinuteSchema,
	durationMin: z.number().int().positive(),
	columnId: z.string(),
	clientId: z.string().nullable(),
	/** Group activities have a title instead of a client. */
	title: z.string().nullable(),
	serviceId: z.string(),
	status: StatusSchema,
	note: z.string(),
	/** The package this session is drawn from; "sessions used" is derived from these links, never typed. */
	packageId: z.string().nullable(),
	/** Rooms and devices used besides the column: they are busy for the same time. */
	resourceIds: z.array(z.string()),
	/** What is charged for this session when it is not drawn from a package (bani). */
	priceBani: z.number().int().nonnegative(),
	/** How it was paid, once it was. */
	paidMethod: z.enum(["cash", "card", "transfer"]).nullable(),
	/** The day-before reminder is sent for this one. */
	remind: z.boolean(),
	/** The weekly series it belongs to. */
	seriesId: z.string().nullable(),
	cancelReason: z.string().nullable(),
});
export type Appointment = z.infer<typeof AppointmentSchema>;

/** The fields a new appointment starts with besides the ones a caller chooses. */
export function appointmentDefaults(): Pick<
	Appointment,
	"packageId" | "resourceIds" | "priceBani" | "paidMethod" | "remind" | "seriesId" | "cancelReason"
> {
	return {
		packageId: null,
		resourceIds: [],
		priceBani: 0,
		paidMethod: null,
		remind: true,
		seriesId: null,
		cancelReason: null,
	};
}

export const NewClientSchema = z.object({
	name: z.string().trim().min(1).max(120),
	phone: z.string().trim().max(40).nullable(),
	guardian: z.string().trim().max(120).nullable(),
	email: z.string().trim().max(200).nullable().optional(),
	birthYear: z.number().int().min(1900).max(2100).optional(),
});
export type NewClient = z.infer<typeof NewClientSchema>;

export const RecurrenceSchema = z
	.object({
		/** A weekly series; the end is a count or a last day. */
		count: z.number().int().min(2).max(52).optional(),
		until: IsoDateSchema.optional(),
	})
	.refine((r) => (r.count === undefined) !== (r.until === undefined), "count or until");
export type Recurrence = z.infer<typeof RecurrenceSchema>;

export const NewAppointmentSchema = z.object({
	date: IsoDateSchema,
	startMin: MinuteSchema,
	columnId: z.string().min(1),
	clientId: z.string().min(1),
	serviceId: z.string().min(1),
	/** Chosen duration; the service's when absent. */
	durationMin: z.number().int().min(5).max(600).optional(),
	status: z.enum(["confirmed", "requested"]).default("confirmed"),
	note: z.string().max(1000).default(""),
	resourceIds: z.array(z.string()).default([]),
	packageId: z.string().nullable().default(null),
	/** Price when no package pays for it; the service's when absent. */
	priceBani: z.number().int().nonnegative().optional(),
	remind: z.boolean().default(true),
	recurrence: RecurrenceSchema.nullable().default(null),
});
export type NewAppointment = z.input<typeof NewAppointmentSchema>;

/** A change to one appointment: every field optional, only what is present changes. */
export const AppointmentPatchSchema = z.object({
	date: IsoDateSchema.optional(),
	startMin: MinuteSchema.optional(),
	durationMin: z.number().int().min(5).max(600).optional(),
	columnId: z.string().min(1).optional(),
	clientId: z.string().min(1).optional(),
	serviceId: z.string().min(1).optional(),
	status: StatusSchema.optional(),
	note: z.string().max(1000).optional(),
	resourceIds: z.array(z.string()).optional(),
	packageId: z.string().nullable().optional(),
	priceBani: z.number().int().nonnegative().optional(),
	remind: z.boolean().optional(),
});
export type AppointmentPatch = z.infer<typeof AppointmentPatchSchema>;

export const PaymentMethodSchema = z.enum(["cash", "card", "transfer"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export const PaymentSchema = z.object({
	id: z.string(),
	date: IsoDateSchema,
	/** Money is integer bani: no floating point anywhere near a ledger. */
	amountBani: z.number().int().positive(),
	method: PaymentMethodSchema,
	recordedBy: z.string(),
});
export type Payment = z.infer<typeof PaymentSchema>;
export const NewPaymentSchema = PaymentSchema.omit({
	id: true,
	recordedBy: true,
});
export type NewPayment = z.infer<typeof NewPaymentSchema>;

export const PackageSchema = z.object({
	id: z.string(),
	clientId: z.string(),
	name: z.string(),
	sessions: z.number().int().nonnegative(),
	bonus: z.number().int().nonnegative(),
	totalBani: z.number().int().nonnegative(),
	note: z.string(),
	/** What was paid is the sum of these: there is no typed "paid". */
	payments: z.array(PaymentSchema),
});
export type Package = z.infer<typeof PackageSchema>;

const PackageFieldsSchema = z.object({
	name: z.string().trim().min(1).max(120),
	sessions: z.number().int().min(0).max(999),
	bonus: z.number().int().min(0).max(999),
	totalBani: z.number().int().min(0).max(100_000_000),
	note: z.string().max(1000),
});
export const NewPackageSchema = PackageFieldsSchema.partial({
	note: true,
	bonus: true,
}).transform((v) => ({ ...v, bonus: v.bonus ?? 0, note: v.note ?? "" }));
export type NewPackage = z.infer<typeof NewPackageSchema>;
/** One field at a time: the console saves each value as it is edited. */
export const PackagePatchSchema = PackageFieldsSchema.partial();
export type PackagePatch = z.infer<typeof PackagePatchSchema>;

export const RosterKindSchema = z.enum(["work", "leave", "medical", "free"]);
export type RosterKind = z.infer<typeof RosterKindSchema>;
export const RosterEntrySchema = z.object({
	personId: z.string(),
	date: IsoDateSchema,
	kind: RosterKindSchema,
	fromMin: MinuteSchema.nullable(),
	toMin: MinuteSchema.nullable(),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

export const WebRequestSchema = z.object({
	id: z.string(),
	receivedAt: z.string(),
	name: z.string(),
	phone: z.string(),
	service: z.string(),
	message: z.string(),
	handled: z.boolean(),
});
export type WebRequest = z.infer<typeof WebRequestSchema>;

/** Where a change came from: the console, the staff assistant, the public site, an import run, a service key. */
export const AUDIT_SOURCES = ["console", "assistant", "site", "import", "api-key"] as const;
export const AuditSourceSchema = z.enum(AUDIT_SOURCES);
export type AuditSource = z.infer<typeof AuditSourceSchema>;

/** One field that changed, as text: what it was and what it became (`null`: it had no value). */
export const AuditChangeSchema = z.object({
	field: z.string(),
	before: z.string().nullable(),
	after: z.string().nullable(),
});
export type AuditChange = z.infer<typeof AuditChangeSchema>;

export const AuditEventSchema = z.object({
	id: z.string(),
	at: z.string(),
	/** The person's subject, or a name where the store only kept one. */
	actor: z.string(),
	action: z.string(),
	/** `type:id`, or a bare id where the store kept no type. */
	target: z.string(),
	targetType: z.string().optional(),
	targetId: z.string().optional(),
	/** Looking at the app as someone else: who it was (the actor is the administrator). */
	asWhom: z.string().optional(),
	/** The reason the person gave (a cancellation). */
	reason: z.string().optional(),
	source: AuditSourceSchema.optional(),
	requestId: z.string().optional(),
	ip: z.string().optional(),
	device: z.string().optional(),
	changes: z.array(AuditChangeSchema).optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const RESOURCES = [
	{ key: "appointments", group: "calendar" },
	{ key: "calendars", group: "calendar" },
	{ key: "groups", group: "calendar" },
	{ key: "clients", group: "clients" },
	{ key: "clinical", group: "clients" },
	{ key: "files", group: "clients" },
	{ key: "blacklist", group: "clients" },
	{ key: "notes", group: "clients" },
	{ key: "packages", group: "money" },
	{ key: "payments", group: "money" },
	{ key: "prices", group: "money" },
	{ key: "roster", group: "team" },
	{ key: "leave", group: "team" },
	{ key: "reminders", group: "communication" },
	{ key: "requests", group: "communication" },
	{ key: "settings", group: "administration" },
	{ key: "members", group: "administration" },
	{ key: "roles", group: "administration" },
	{ key: "audit", group: "administration" },
	{ key: "reports", group: "administration" },
] as const;
export const ACTIONS = [
	"view",
	"create",
	"edit",
	"cancel",
	"archive",
	"export",
	"send",
	"approve",
	"assign",
	"price",
	"pin",
	"invite",
] as const;
export const SCOPES = ["all", "assigned", "own"] as const;
export const FIELD_GROUPS = ["contact", "guardian", "money", "clinical"] as const;

/** Which actions make sense on which resource: the matrix offers nothing else. */
export const RESOURCE_ACTIONS: Readonly<
	Record<(typeof RESOURCES)[number]["key"], ReadonlyArray<(typeof ACTIONS)[number]>>
> = {
	appointments: ["view", "create", "edit", "cancel", "assign", "export"],
	calendars: ["view", "edit", "assign"],
	groups: ["view", "create", "edit", "cancel"],
	clients: ["view", "create", "edit", "archive", "cancel", "export", "invite"],
	clinical: ["view", "create", "edit", "export"],
	files: ["view", "create", "cancel", "export"],
	blacklist: ["view", "create", "edit", "cancel", "approve"],
	notes: ["view", "create", "edit", "cancel", "pin"],
	packages: ["view", "create", "edit", "cancel", "price"],
	payments: ["view", "create", "edit", "export", "price"],
	prices: ["view", "edit"],
	roster: ["view", "edit", "export"],
	leave: ["view", "create", "approve"],
	reminders: ["view", "send"],
	requests: ["view", "approve"],
	settings: ["view", "edit"],
	members: ["view", "create", "edit", "cancel"],
	roles: ["view", "create", "edit", "cancel"],
	audit: ["view", "export"],
	reports: ["view"],
};

export const ScopeSchema = z.enum(SCOPES);
export type ScopeName = z.infer<typeof ScopeSchema>;
export type FieldGroupName = (typeof FIELD_GROUPS)[number];
export const RoleSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	members: z.number().int().nonnegative(),
	/** grants[resource][action] = scope. Absent = none. */
	grants: z.record(z.record(ScopeSchema)),
	fieldGroups: z.array(z.enum(FIELD_GROUPS)),
	/** The roles it includes: their permissions are held through it (the port fills this in). */
	includes: z.array(z.string()).optional(),
	/** inherited[resource][action]: the widest scope held through an included role, and the nearest role holding it. */
	inherited: z.record(z.record(z.object({ scope: ScopeSchema, from: z.string() }))).optional(),
	/** Every relation it holds in the end, its own and inherited: what "inclus în" is computed from. */
	effective: z.array(z.string()).optional(),
});
export type Role = z.infer<typeof RoleSchema>;

export const MembershipSchema = z.object({
	app: AppSlugSchema,
	roles: z.array(z.string()),
});
export type Membership = z.infer<typeof MembershipSchema>;

export const SearchHitSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("client"),
		id: z.string(),
		label: z.string(),
		detail: z.string(),
	}),
	z.object({
		kind: z.literal("appointment"),
		id: z.string(),
		label: z.string(),
		detail: z.string(),
		date: IsoDateSchema,
	}),
]);
export type SearchHit = z.infer<typeof SearchHitSchema>;

/** How the assistant shows: the glowing conversation bar at the foot of the screen (the default), or the side panel. */
export const ASSISTANT_MODES = ["bar", "panel"] as const;
export const AssistantModeSchema = z.enum(ASSISTANT_MODES);
export type AssistantMode = z.infer<typeof AssistantModeSchema>;

/** Where a client stands with the online account: the service's words, `expired` being what a lapsed `invited` reads as. */
export const InviteStatusSchema = z.enum(["invited", "active", "expired", "revoked"]);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;
export const InviteContactSchema = z.enum(["client", "guardian"]);
export type InviteContact = z.infer<typeof InviteContactSchema>;
export const InviteLocaleSchema = z.enum(["ro", "en"]);

export const InviteSchema = z.object({
	status: InviteStatusSchema,
	contact: InviteContactSchema,
	/** The address with its middle hidden (`a***@gmail.com`). */
	sentTo: z.string(),
	locale: InviteLocaleSchema,
	/** UTC milliseconds. */
	invitedAt: z.number(),
	expiresAt: z.number(),
	sends: z.number().int().positive(),
	activatedAt: z.number().optional(),
	/** The address already had an online account, so nobody was asked to set a password. */
	existingAccount: z.boolean(),
});
export type Invite = z.infer<typeof InviteSchema>;

export const InvitePickSchema = z.object({
	contact: InviteContactSchema,
	locale: InviteLocaleSchema,
});
export type InvitePick = z.infer<typeof InvitePickSchema>;

/** The e-mail as it would go, with a placeholder where the one-time link will be. */
export const InvitePreviewSchema = z.object({
	to: z.string(),
	subject: z.string(),
	html: z.string(),
	text: z.string(),
	expiresAt: z.number(),
	existingAccount: z.boolean(),
});
export type InvitePreview = z.infer<typeof InvitePreviewSchema>;
