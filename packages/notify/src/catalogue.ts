import { z } from "zod";
import { type EventId, EventIdSchema } from "./apps";

const Id = z.string().min(1).max(120);
const Text = z.string().min(1).max(200);
const Instant = z.string().datetime({ offset: true });
const Url = z.string().url().max(2048);

/** Who a workflow addresses. `team`, `reception` and `owners` are Novu topics `<app>:<audience>`. */
export const AUDIENCES = [
	"team",
	"reception",
	"owners",
	"client",
	"practitioner",
	"requester",
	"actor",
] as const;
export const AudienceSchema = z.enum(AUDIENCES);
export type Audience = z.infer<typeof AudienceSchema>;

/** The push purposes a person can switch on or off (the preferences UI's three groups). */
export const PUSH_KINDS = ["requests", "appointments", "reminders"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export const CHANNELS = ["in_app", "push", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

const Appointment = z.object({
	appointmentId: Id,
	/** The client's display name; only team-facing and own-client messages print it. */
	clientName: Text,
	serviceName: Text,
	startsAt: Instant,
	practitionerName: Text.optional(),
});

const Calendar = z.object({
	/** A signed link to the .ics of this appointment (see reminders/links). */
	icsUrl: Url.optional(),
	/** The client's own page for this appointment. */
	manageUrl: Url.optional(),
});

export const PAYLOADS = {
	"request.new": z.object({
		requestId: Id,
		name: Text,
		kind: z.enum(["web", "callback", "contact"]),
	}),
	"appointment.requested": Appointment.merge(Calendar),
	"appointment.confirmed": Appointment.merge(Calendar),
	"appointment.moved": Appointment.merge(Calendar).extend({ previousStartsAt: Instant }),
	"appointment.cancelled": Appointment.merge(Calendar),
	"reminder.day_before": Appointment.merge(Calendar).extend({ confirmUrl: Url, cancelUrl: Url }),
	"reminder.confirmed": Appointment,
	"reminder.declined": Appointment,
	"package.running_low": z.object({
		packageId: Id,
		clientId: Id,
		clientName: Text,
		remaining: z.number().int().min(0).max(1000),
	}),
	"leave.requested": z.object({
		leaveId: Id,
		personName: Text,
		from: z.string().date(),
		to: z.string().date(),
	}),
	"leave.approved": z.object({ leaveId: Id, from: z.string().date(), to: z.string().date() }),
	"leave.declined": z.object({ leaveId: Id, from: z.string().date(), to: z.string().date() }),
	"payment.recorded": z.object({
		paymentId: Id,
		serviceName: Text,
		/** Already formatted money, e.g. "250 RON": the service owns currency rules. */
		amount: z.string().min(1).max(40),
		receiptUrl: Url.optional(),
	}),
	"assistant.action_done": z.object({
		actionId: Id,
		/** One sentence the assistant wrote for its actor. */
		summary: z.string().min(1).max(400),
		openPath: z
			.string()
			.regex(/^\/(?!\/)[^\\\s]*$/)
			.max(512)
			.optional(),
	}),
} as const satisfies Record<EventId, z.ZodTypeAny>;

export type PayloadOf<E extends EventId> = z.infer<(typeof PAYLOADS)[E]>;

/** One workflow: an event for one audience, through the channels it uses by default. */
export interface Entry {
	readonly event: EventId;
	readonly audience: Audience;
	readonly channels: ReadonlyArray<Channel>;
	/** The push purpose, when push is a channel. */
	readonly push?: PushKind;
	/** Where the notification leads, relative to the console (staff) or the site (clients). */
	readonly path: (payload: Record<string, unknown>) => string;
}

const appointmentPath = (p: Record<string, unknown>): string =>
	`/calendar?appointment=${encodeURIComponent(String(p.appointmentId))}`;

export const CATALOGUE: ReadonlyArray<Entry> = [
	{
		event: "request.new",
		audience: "team",
		channels: ["in_app", "push", "email"],
		push: "requests",
		path: (p) => `/requests/${encodeURIComponent(String(p.requestId))}`,
	},
	{ event: "appointment.requested", audience: "client", channels: ["email"], path: () => "/cont" },
	{
		event: "appointment.requested",
		audience: "practitioner",
		channels: ["in_app", "push"],
		push: "appointments",
		path: appointmentPath,
	},
	{
		event: "appointment.confirmed",
		audience: "client",
		channels: ["email", "push"],
		push: "appointments",
		path: () => "/cont",
	},
	{
		event: "appointment.confirmed",
		audience: "practitioner",
		channels: ["in_app", "push"],
		push: "appointments",
		path: appointmentPath,
	},
	{
		event: "appointment.moved",
		audience: "client",
		channels: ["email", "push"],
		push: "appointments",
		path: () => "/cont",
	},
	{
		event: "appointment.moved",
		audience: "practitioner",
		channels: ["in_app", "push"],
		push: "appointments",
		path: appointmentPath,
	},
	{
		event: "appointment.cancelled",
		audience: "client",
		channels: ["email", "push"],
		push: "appointments",
		path: () => "/cont",
	},
	{
		event: "appointment.cancelled",
		audience: "practitioner",
		channels: ["in_app", "push"],
		push: "appointments",
		path: appointmentPath,
	},
	{
		event: "reminder.day_before",
		audience: "client",
		channels: ["email", "push"],
		push: "reminders",
		path: () => "/cont",
	},
	{
		event: "reminder.confirmed",
		audience: "reception",
		channels: ["in_app"],
		path: appointmentPath,
	},
	{
		event: "reminder.declined",
		audience: "reception",
		channels: ["in_app"],
		path: appointmentPath,
	},
	{
		event: "package.running_low",
		audience: "reception",
		channels: ["in_app"],
		path: (p) =>
			`/clients/${encodeURIComponent(String(p.clientId))}/packages/${encodeURIComponent(String(p.packageId))}`,
	},
	{
		event: "leave.requested",
		audience: "owners",
		channels: ["in_app", "push"],
		push: "requests",
		path: () => "/roster/leave",
	},
	{
		event: "leave.approved",
		audience: "requester",
		channels: ["in_app"],
		path: () => "/roster/leave",
	},
	{
		event: "leave.declined",
		audience: "requester",
		channels: ["in_app"],
		path: () => "/roster/leave",
	},
	{ event: "payment.recorded", audience: "client", channels: ["email"], path: () => "/cont" },
	{
		event: "assistant.action_done",
		audience: "actor",
		channels: ["in_app"],
		path: (p) => (typeof p.openPath === "string" ? p.openPath : "/"),
	},
];

/** Novu's workflow id: unique per app, event and audience (`psizone-appointment-confirmed-client`). */
export function workflowId(app: string, event: EventId, audience: Audience): string {
	return `${app}-${event.replace(/[._]/g, "-")}-${audience}`;
}

export function entriesFor(event: EventId): ReadonlyArray<Entry> {
	return CATALOGUE.filter((e) => e.event === event);
}

export function entryFor(event: EventId, audience: Audience): Entry | undefined {
	return CATALOGUE.find((e) => e.event === event && e.audience === audience);
}

/** The i18n message-key stem of an entry: `appointment_confirmed_client`. */
export function messageStem(e: Pick<Entry, "event" | "audience">): string {
	return `${e.event.replace(/\./g, "_")}_${e.audience}`;
}

export { EventIdSchema };
