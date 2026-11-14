import { z } from "zod/v4";

/**
 * What a person can switch on or off: one row per kind of notification, one switch per channel. The list is the
 * contract's copy of `@psi/notify`'s (`NOTIFY_KINDS`); the service's guard test fails when the two differ.
 */
export const NOTIFY_KINDS = [
	"requests",
	"appointments",
	"reminders",
	"packages",
	"payments",
	"feedback",
	"account",
	"digests",
	"alerts",
	"security",
	"assignments",
	"leave",
] as const;
export const NotifyKind = z.enum(NOTIFY_KINDS);
export type NotifyKindName = z.infer<typeof NotifyKind>;

export const NOTIFY_CHANNELS = ["in_app", "push", "email"] as const;
export const NotifyChannel = z.enum(NOTIFY_CHANNELS);

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** `true` or `false` per channel; a channel left out follows the kind's default. */
export const ChannelSwitches = z
	.object({ in_app: z.boolean(), push: z.boolean(), email: z.boolean() })
	.partial()
	.strict();

/** Quiet hours hold back PUSH between `start` and `end` (the person's zone; may span midnight). */
export const PersonalQuietHours = z
	.object({ start: Clock, end: Clock, timeZone: z.string().min(1).max(64) })
	.strict();

export const NotificationPrefs = z
	.object({
		channels: z.partialRecord(NotifyKind, ChannelSwitches),
		quietHours: PersonalQuietHours.nullable(),
		/** The language the person's notifications are written in; absent follows the app's. */
		locale: z.enum(["ro", "en"]).optional(),
	})
	.strict();

/** How far a notification got (see `@psi/notify`'s `DeliveryStatus`): the honest ladder ends where this service can see. */
export const DELIVERY_STATUSES = ["queued", "retrying", "sent", "given_up", "suppressed"] as const;
export const DeliveryStatusName = z.enum(DELIVERY_STATUSES);

/** One step in a notification's life. Ids and outcomes only: never an address, a name or the text sent. */
export const DeliveryStepView = z.object({
	event: z.string(),
	audience: z.string(),
	/** A short hash of who it was for. */
	to: z.string(),
	/** The object it was about (an appointment, a request), when it names one. */
	ref: z.string().optional(),
	status: DeliveryStatusName,
	channels: z.object({ in_app: z.boolean(), push: z.boolean(), email: z.boolean() }),
	why: z.string().optional(),
	attempts: z.number().int(),
	httpStatus: z.number().int().optional(),
	at: z.number().int(),
});
export const DeliveryQuery = z.object({
	/** A UTC day, `YYYY-MM-DD`; default today. */
	day: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	status: DeliveryStatusName.optional(),
});
export const DeliveryList = z.object({ items: z.array(DeliveryStepView) });

/** What the preferences page draws: the person's choices and, per kind, which channels exist and which cannot be turned off. */
export const NotificationKindInfo = z.object({
	kind: NotifyKind,
	offered: z.array(NotifyChannel),
	defaults: z.array(NotifyChannel),
	locked: z.array(NotifyChannel),
});
export const NotificationPrefsView = z.object({
	prefs: NotificationPrefs,
	kinds: z.array(NotificationKindInfo),
});
