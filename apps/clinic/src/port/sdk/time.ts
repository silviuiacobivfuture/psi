const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
	let f = formatters.get(timeZone);
	if (f === undefined) {
		f = new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		});
		formatters.set(timeZone, f);
	}
	return f;
}

function fields(ms: number, timeZone: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const p of formatter(timeZone).formatToParts(new Date(ms)))
		if (p.type !== "literal") out[p.type] = Number(p.value);
	return out;
}

/** An instant as the clinic's wall clock reads it: the local date and the minutes after midnight. */
export function wallOf(ms: number, timeZone: string): { date: string; minutes: number } {
	const f = fields(ms, timeZone);
	const pad = (n: number | undefined, w = 2): string => String(n ?? 0).padStart(w, "0");
	return {
		date: `${pad(f.year, 4)}-${pad(f.month)}-${pad(f.day)}`,
		minutes: (f.hour ?? 0) * 60 + (f.minute ?? 0),
	};
}

/** The instant a local date and minute-of-day name in the clinic's zone (the first, when daylight saving repeats it). */
export function instantOf(date: string, minutes: number, timeZone: string): number {
	const [y, mo, d] = date.split("-").map(Number);
	const naive = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, 0, minutes);
	let guess = naive;
	for (let i = 0; i < 3; i++) {
		const f = fields(guess, timeZone);
		const shown = Date.UTC(
			f.year ?? 1970,
			(f.month ?? 1) - 1,
			f.day ?? 1,
			f.hour ?? 0,
			f.minute ?? 0,
		);
		guess += naive - shown;
	}
	return guess;
}
