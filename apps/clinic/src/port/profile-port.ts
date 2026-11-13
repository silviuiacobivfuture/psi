import { z } from "zod";
import type { AppSlug } from "./schema";

/** The ways the console tells a person something, and the kinds of thing it tells. */
export const NOTIFY_CHANNELS = ["inbox", "push", "email"] as const;
export const NOTIFY_KINDS = ["requests", "appointments", "reminders", "feedback"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

/** One cell of the preferences: whether `kind` reaches the person through `channel`. */
export const NotificationPrefsSchema = z.object({
	prefs: z.array(
		z.object({ kind: z.enum(NOTIFY_KINDS), channel: z.enum(NOTIFY_CHANNELS), on: z.boolean() }),
	),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

/** What the service keeps about a person beyond their sign-in: today their phone number. */
export const ProfileSchema = z.object({ phone: z.string().max(40).nullable() });
export type Profile = z.infer<typeof ProfileSchema>;

/** A thing the person told the team (a suggestion, a problem) and how it stands. */
export const MyFeedbackSchema = z.object({
	id: z.string(),
	at: z.string(),
	text: z.string(),
	status: z.enum(["open", "answered"]),
	reply: z.string().nullable(),
});
export type MyFeedback = z.infer<typeof MyFeedbackSchema>;

/**
 * What the profile page reads and writes, about the signed-in person only. Each call may refuse `unavailable` while the
 * service keeps no such thing; the page then says so in that section and the rest still works.
 */
export interface ProfilePort {
	profile(app: AppSlug, subject: string): Promise<Profile>;
	saveProfile(app: AppSlug, subject: string, profile: Profile): Promise<void>;
	/** Per channel per kind. A kind the person never chose is on in the inbox and off elsewhere. */
	notificationPrefs(subject: string): Promise<NotificationPrefs>;
	saveNotificationPrefs(subject: string, prefs: NotificationPrefs): Promise<void>;
	myFeedback(app: AppSlug, subject: string): Promise<ReadonlyArray<MyFeedback>>;
}

/** The default for a cell nobody chose. */
export const defaultOn = (channel: NotifyChannel): boolean => channel === "inbox";
