import { STATUSES } from "@psi/ui/admin";
import { z } from "zod";

export const AppSlugSchema = z.enum(["psizone", "hemisync"]);
export type AppSlug = z.infer<typeof AppSlugSchema>;

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Minutes after midnight, clinic local time. */
export const MinuteSchema = z.number().int().min(0).max(1440);

export const StatusSchema = z.enum(STATUSES);

export const ClientFilterSchema = z.enum(["current", "archived"]);

export const ColumnKindSchema = z.enum(["person", "device", "room", "group"]);
export const ColumnSchema = z.object({
	id: z.string(),
	kind: ColumnKindSchema,
	name: z.string(),
	/** 1..6: the calendar column colour role. */
	colour: z.number().int().min(1).max(6),
});
export type Column = z.infer<typeof ColumnSchema>;

export const ServiceSchema = z.object({
	id: z.string(),
	name: z.string(),
	durationMin: z.number().int().positive(),
	/** Null: the person may not see prices (a field group the service leaves out). */
	priceBani: z.number().int().nonnegative().nullable(),
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
});
export type Appointment = z.infer<typeof AppointmentSchema>;

export const NewAppointmentSchema = z.object({
	date: IsoDateSchema,
	startMin: MinuteSchema,
	columnId: z.string().min(1),
	clientId: z.string().min(1),
	serviceId: z.string().min(1),
});
export type NewAppointment = z.infer<typeof NewAppointmentSchema>;

export const PackageSchema = z.object({
	id: z.string(),
	clientId: z.string(),
	name: z.string(),
	sessions: z.number().int().nonnegative(),
	bonus: z.number().int().nonnegative(),
	used: z.number().int().nonnegative(),
	/** Money is integer bani: no floating point anywhere near a ledger. */
	totalBani: z.number().int().nonnegative(),
	paidBani: z.number().int().nonnegative(),
	note: z.string(),
});
export type Package = z.infer<typeof PackageSchema>;

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

export const AuditEventSchema = z.object({
	id: z.string(),
	at: z.string(),
	actor: z.string(),
	action: z.string(),
	target: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const RESOURCES = [
	{ key: "appointments", group: "calendar" },
	{ key: "calendars", group: "calendar" },
	{ key: "groups", group: "calendar" },
	{ key: "clients", group: "clients" },
	{ key: "clinical", group: "clients" },
	{ key: "files", group: "clients" },
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
	clients: ["view", "create", "edit", "archive", "cancel", "export"],
	clinical: ["view", "create", "edit", "export"],
	files: ["view", "create", "cancel", "export"],
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
});
export type Role = z.infer<typeof RoleSchema>;

export const MembershipSchema = z.object({
	app: AppSlugSchema,
	roles: z.array(z.string()),
});
export type Membership = z.infer<typeof MembershipSchema>;

export const SearchHitSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("client"), id: z.string(), label: z.string(), detail: z.string() }),
	z.object({
		kind: z.literal("appointment"),
		id: z.string(),
		label: z.string(),
		detail: z.string(),
		date: IsoDateSchema,
	}),
]);
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const PushPrefsSchema = z.object({ requests: z.boolean(), reminders: z.boolean() });
export type PushPrefs = z.infer<typeof PushPrefsSchema>;
