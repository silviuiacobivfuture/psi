import type { MySettingsType } from "@psi/scheduling-sdk/contract";

/**
 * "Setările mele": a person's own settings, the scheduling service's contract as is (language, theme, first calendar
 * view, quiet hours, e-mail and push per kind). The console reads them with the person's own token and never anyone
 * else's.
 */
export {
	DEFAULT_SETTINGS,
	MySettings as MySettingsSchema,
	NOTIFY_CHANNELS,
	NOTIFY_KINDS,
	type NotifyChannel,
	type NotifyKind,
} from "@psi/scheduling-sdk/contract";
export type MySettings = MySettingsType;
/** The settings as read: `stored` is false while the person never saved any (they are then the defaults). */
export type MySettingsView = MySettings & { stored: boolean };
