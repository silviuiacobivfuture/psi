import { z } from "zod/v4";
import { Ms } from "./primitives";

/**
 * A person's own settings in one app, kept by the service: the console's language, theme and first calendar view. How
 * they are told things (channels per kind, quiet hours) is `me.notifications`, the one place the notifier reads.
 */
export const MySettings = z.object({
	locale: z.enum(["ro", "en"]),
	theme: z.enum(["light", "dark", "system"]),
	calendarView: z.enum(["day", "week", "month"]),
	/** How many rows the console's long lists show a page (the size last picked); absent: the console's default. */
	pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).optional(),
});
export type MySettingsType = z.output<typeof MySettings>;

/** What a person starts with: Romanian, the device's theme, the day view. */
export const DEFAULT_SETTINGS: MySettingsType = {
	locale: "ro",
	theme: "system",
	calendarView: "day",
};

/** The settings as answered: `stored` is false (and `updatedAt` absent) while the person never saved any. */
export const MySettingsOut = MySettings.extend({ stored: z.boolean(), updatedAt: Ms.optional() });
