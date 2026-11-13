import { addDays, todayIso } from "../lib/dates";
import {
	defaultOn,
	type MyFeedback,
	NOTIFY_CHANNELS,
	NOTIFY_KINDS,
	type NotificationPrefs,
	type Profile,
	type ProfilePort,
} from "./profile-port";

/** The development profile store: a phone, the notification matrix and a couple of feedback notes, per person. */
export function createFakeProfile(subjects: ReadonlyArray<string>): ProfilePort {
	const phones = new Map<string, string | null>();
	const prefs = new Map<string, NotificationPrefs>();
	const first = subjects[0];
	const note = (n: number, status: MyFeedback["status"]): MyFeedback => ({
		id: `f${n}`,
		at: `${addDays(todayIso(), -n * 3)}T10:00:00Z`,
		text:
			n === 1
				? "Aș vrea să văd în calendar și programările anulate, cu un semn."
				: "Butonul de plată e greu de găsit pe telefon.",
		status,
		reply: status === "answered" ? "Mulțumim! Am adăugat un filtru în calendar." : null,
	});
	return {
		async profile(_app, subject): Promise<Profile> {
			return { phone: phones.get(subject) ?? null };
		},
		async saveProfile(_app, subject, profile) {
			phones.set(subject, profile.phone);
		},
		async notificationPrefs(subject): Promise<NotificationPrefs> {
			return (
				prefs.get(subject) ?? {
					prefs: NOTIFY_KINDS.flatMap((kind) =>
						NOTIFY_CHANNELS.map((channel) => ({ kind, channel, on: defaultOn(channel) })),
					),
				}
			);
		},
		async saveNotificationPrefs(subject, next) {
			prefs.set(subject, next);
		},
		async myFeedback(_app, subject) {
			return subject === first ? [note(1, "answered"), note(2, "open")] : [];
		},
	};
}
