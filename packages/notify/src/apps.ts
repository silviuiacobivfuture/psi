import { z } from "zod";

/** The apps (tenants) of the scheduling service that send notifications. */
export const APP_KEYS = ["psizone", "hemisync"] as const;
export const AppKeySchema = z.enum(APP_KEYS);
export type AppKey = z.infer<typeof AppKeySchema>;

/** The design-language theme an app's e-mail is painted from (@psi/design tokens). */
export const EmailThemeSchema = z.enum(["psizone-light", "hemisync-light"]);
export type EmailTheme = z.infer<typeof EmailThemeSchema>;

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");

/** Pushes are held back between `start` and `end` (local time of `timeZone`; may span midnight). */
export const QuietHoursSchema = z
	.object({ start: Clock, end: Clock, timeZone: z.string().min(1).max(64) })
	.strict();
export type QuietHours = z.infer<typeof QuietHoursSchema>;

/** Every notification event, as the scheduling service emits it. */
export const EVENT_IDS = [
	"request.new",
	"appointment.requested",
	"appointment.confirmed",
	"appointment.moved",
	"appointment.cancelled",
	"reminder.day_before",
	"reminder.confirmed",
	"reminder.declined",
	"package.running_low",
	"leave.requested",
	"leave.approved",
	"leave.declined",
	"payment.recorded",
	"assistant.action_done",
	"reminder.two_hours",
	"feedback.requested",
	"account.invite",
	"account.invite_existing",
	"account.activated",
	"team.invite",
	"blacklist.attempt",
	"appointment.conflict",
	"reminder.failed",
	"digest.reception_daily",
	"digest.practitioner_evening",
	"digest.owner_daily",
	"digest.owner_weekly",
	"schedule.changed",
	"record.todo",
	"client.assigned",
	"feedback.negative",
	"delivery.failed",
	"security.action",
] as const;
export const EventIdSchema = z.enum(EVENT_IDS);
export type EventId = z.infer<typeof EventIdSchema>;

/** One app's notification settings: who the mail is from, how it looks, what is on, when pushes rest. */
export const AppSettingsSchema = z
	.object({
		/** The display name of the sender; the address is the app's Plunk sender (`plunk-<app>`). */
		senderName: z.string().min(1).max(80),
		replyTo: z.string().email(),
		/** The brand name used in subjects' footers and in the push title. */
		brandName: z.string().min(1).max(80),
		theme: EmailThemeSchema,
		/** The clinic's postal address and map link shown in the appointment e-mails. */
		place: z
			.object({
				name: z.string().min(1).max(120),
				address: z.string().min(1).max(240),
				mapUrl: z.string().url(),
			})
			.strict(),
		/** The zone appointment times are written in. */
		timeZone: z.string().min(1).max(64),
		/** Events switched off for this app; absent means on. */
		off: z.array(EventIdSchema).max(EVENT_IDS.length).default([]),
		/** Payment receipts go to clients only when the app turns them on. */
		receipts: z.boolean().default(false),
		quietHours: QuietHoursSchema.nullable().default(null),
	})
	.strict();
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type AppSettingsInput = z.input<typeof AppSettingsSchema>;

/** Defaults the apps start from; the scheduling service stores the owner's edits over them. */
export const APP_DEFAULTS: Readonly<Record<AppKey, AppSettings>> = {
	psizone: AppSettingsSchema.parse({
		senderName: "Psizone",
		replyTo: "programari@psizone.ro",
		brandName: "Psizone",
		theme: "psizone-light",
		place: {
			name: "Psizone",
			address: "Strada General Alexandru Cernat 126, Galați",
			mapUrl:
				"https://www.google.com/maps/search/?api=1&query=Strada+General+Alexandru+Cernat+126+Gala%C8%9Bi",
		},
		timeZone: "Europe/Bucharest",
		quietHours: { start: "21:00", end: "08:00", timeZone: "Europe/Bucharest" },
		// The feedback e-mail leads to a page on the site that does not exist yet (slice 6): off until it does.
		off: ["feedback.requested"],
	}),
	hemisync: AppSettingsSchema.parse({
		senderName: "Hemi-Sync România",
		replyTo: "hemisync@psizone.ro",
		brandName: "Hemi-Sync România",
		theme: "hemisync-light",
		place: {
			name: "Hemi-Sync România",
			address: "Strada General Alexandru Cernat 126, Galați",
			mapUrl:
				"https://www.google.com/maps/search/?api=1&query=Strada+General+Alexandru+Cernat+126+Gala%C8%9Bi",
		},
		timeZone: "Europe/Bucharest",
		quietHours: { start: "21:00", end: "08:00", timeZone: "Europe/Bucharest" },
		// The feedback e-mail leads to a page on the site that does not exist yet (slice 6): off until it does.
		off: ["feedback.requested"],
	}),
};

/** Whether `now` falls in quiet hours (start inclusive, end exclusive; start > end spans midnight). */
export function inQuietHours(quiet: QuietHours | null, now: number): boolean {
	if (quiet === null || quiet.start === quiet.end) return false;
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: quiet.timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(now);
	const local = parts.replace(/^24/, "00");
	return quiet.start < quiet.end
		? local >= quiet.start && local < quiet.end
		: local >= quiet.start || local < quiet.end;
}
