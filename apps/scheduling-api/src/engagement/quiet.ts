import {
	APP_DEFAULTS,
	type AppKey,
	inQuietHours,
	type PreferenceSource,
	type QuietHours,
} from "@psi/notify";

const STEP = 15 * 60_000;
const DAY = 24 * 3_600_000;

/**
 * When `now` falls in these quiet hours, the first quarter hour after it that does not (quiet hours never last a whole
 * day); undefined when `now` is not quiet.
 */
export function quietUntil(quiet: QuietHours | null, now: number): number | undefined {
	if (!inQuietHours(quiet, now)) return undefined;
	for (let at = now + STEP; at < now + DAY; at += STEP) if (!inQuietHours(quiet, at)) return at;
	return undefined;
}

/**
 * The quiet hours that hold for a client, as the notifier applies them: their account's own when they chose some, else
 * the app's. A preference that cannot be read is the app's (a reminder is never lost to it).
 */
export async function clientQuiet(
	prefs: PreferenceSource,
	app: AppKey,
	clientId: string,
): Promise<QuietHours | null> {
	try {
		const own = await prefs.resolve(app, { side: "client", clientId });
		if (own?.quietHours) return own.quietHours;
	} catch {
		// The app's hours below.
	}
	return APP_DEFAULTS[app].quietHours;
}
