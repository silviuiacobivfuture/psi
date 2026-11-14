import { hhmm, weekdayShort } from "../lib/dates";
import type { Locale } from "../lib/i18n";
import type { RosterEntry } from "../port/schema";

/**
 * A week's working hours in a line a person reads: days that share their hours are joined
 * ("lun, mar, mie 09:00–17:00 · joi 10:00–14:00"). Leave and free days are not working hours and are left out.
 */
export function hoursSummary(entries: ReadonlyArray<RosterEntry>, locale: Locale): string {
	const byHours = new Map<string, string[]>();
	const work = entries
		.filter((e) => e.kind === "work" && e.fromMin !== null && e.toMin !== null)
		.sort((a, b) => a.date.localeCompare(b.date));
	for (const e of work) {
		const key = `${hhmm(e.fromMin ?? 0)}–${hhmm(e.toMin ?? 0)}`;
		const day = weekdayShort(locale, e.date);
		byHours.set(key, [...(byHours.get(key) ?? []), day]);
	}
	return [...byHours].map(([hours, days]) => `${days.join(", ")} ${hours}`).join(" · ");
}
