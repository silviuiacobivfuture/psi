import { z } from "zod/v4";
import { Ms } from "./primitives";

/**
 * What a person of the team is told about, by kind (the notification catalogue's push purposes), and the channels a
 * kind may reach them through besides the console's own list, which always shows everything.
 */
export const NOTIFY_KINDS = ["requests", "appointments", "reminders"] as const;
export const NOTIFY_CHANNELS = ["email", "push"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
export const ChannelChoice = z.object({ email: z.boolean(), push: z.boolean() });
export const NotificationChoices = z.object({
	requests: ChannelChoice,
	appointments: ChannelChoice,
	reminders: ChannelChoice,
});

/**
 * A person's own settings in one app, kept by the service: the console's language, theme and first calendar view, and
 * how they are told things. During quiet hours (in the app's time zone; start inclusive, end exclusive, across midnight
 * when start is later than end) no push reaches them; e-mail still does. A kind's channel switched off is never used
 * for it, whatever the catalogue would otherwise send.
 */
export const MySettings = z.object({
	locale: z.enum(["ro", "en"]),
	theme: z.enum(["light", "dark", "system"]),
	calendarView: z.enum(["day", "week", "month"]),
	quietHours: z
		.object({ start: Clock, end: Clock })
		.refine((q) => q.start !== q.end, "start and end differ")
		.nullable(),
	notifications: NotificationChoices,
});
export type MySettingsType = z.output<typeof MySettings>;

/** What a person starts with: Romanian, the device's theme, the day view, no quiet hours, every channel on. */
export const DEFAULT_SETTINGS: MySettingsType = {
	locale: "ro",
	theme: "system",
	calendarView: "day",
	quietHours: null,
	notifications: {
		requests: { email: true, push: true },
		appointments: { email: true, push: true },
		reminders: { email: true, push: true },
	},
};

/** The settings as answered: `stored` is false (and `updatedAt` absent) while the person never saved any. */
export const MySettingsOut = MySettings.extend({ stored: z.boolean(), updatedAt: Ms.optional() });
