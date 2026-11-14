import type { MySettingsType } from "@psi/scheduling-sdk/contract";
import { NotificationPrefs, NotificationPrefsView } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";

/**
 * "Setările mele": a person's own settings, the scheduling service's contract as is. Language, theme and the first
 * calendar view are `me.settings`; how the person is told things (a switch per kind and channel, quiet hours) is
 * `me.notifications`, the one record the notifier reads. The console reads both with the person's own token and never
 * anyone else's.
 */
export {
	DEFAULT_SETTINGS,
	MySettings as MySettingsSchema,
	NOTIFY_CHANNELS,
	NOTIFY_KINDS,
} from "@psi/scheduling-sdk/contract";
export type MySettings = MySettingsType;
/** The settings as read: `stored` is false while the person never saved any (they are then the defaults). */
export type MySettingsView = MySettings & { stored: boolean };

export const MyNotificationsSchema = NotificationPrefs;
export const MyNotificationsViewSchema = NotificationPrefsView;
/** A person's notification choices: unset switches follow the kind's default. */
export type MyNotifications = z.output<typeof NotificationPrefs>;
/** The choices and, per kind of the team's side, the channels it offers, starts with and keeps on. */
export type MyNotificationsView = z.output<typeof NotificationPrefsView>;
export type NotifyKind = MyNotificationsView["kinds"][number]["kind"];
export type NotifyChannel = MyNotificationsView["kinds"][number]["offered"][number];
