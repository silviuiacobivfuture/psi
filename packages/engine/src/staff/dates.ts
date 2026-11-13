import { addDays, weekStart } from "./format";

/**
 * Relative dates the way reception says them ("poimâine", "joia viitoare", "peste 2 săptămâni",
 * "next friday"), resolved against the clinic's today. Deterministic and tested: the model asks
 * for it instead of counting days itself. Matching ignores case and diacritics and forgives one
 * typo in a word of five letters or more.
 */
export type ResolvedDate =
	| { ok: true; kind: "day"; date: string }
	| { ok: true; kind: "week"; date: string; weekEnd: string }
	| { ok: false };

const WEEKDAYS: ReadonlyArray<readonly [number, ReadonlyArray<string>]> = [
	[1, ["luni", "monday", "mon"]],
	[2, ["marti", "tuesday", "tue"]],
	[3, ["miercuri", "wednesday", "wed"]],
	[4, ["joi", "thursday", "thu"]],
	[5, ["vineri", "friday", "fri"]],
	[6, ["sambata", "saturday", "sat"]],
	[7, ["duminica", "sunday", "sun"]],
];

const NUMBERS: Readonly<Record<string, number>> = {
	o: 1,
	un: 1,
	una: 1,
	one: 1,
	a: 1,
	doua: 2,
	doi: 2,
	two: 2,
	trei: 3,
	three: 3,
	patru: 4,
	four: 4,
	cinci: 5,
	five: 5,
	sase: 6,
	six: 6,
	sapte: 7,
	seven: 7,
	opt: 8,
	eight: 8,
	noua: 9,
	nine: 9,
	zece: 10,
	ten: 10,
};

const DAY_WORDS: ReadonlyArray<readonly [number, ReadonlyArray<string>]> = [
	[0, ["azi", "astazi", "today", "acum"]],
	[1, ["maine", "tomorrow"]],
	[2, ["poimaine", "overmorrow"]],
	[-1, ["ieri", "yesterday"]],
	[-2, ["alaltaieri", "alaltaieri"]],
];

const UNITS: ReadonlyArray<readonly [number, ReadonlyArray<string>]> = [
	[1, ["zi", "zile", "day", "days"]],
	[7, ["saptamana", "saptamani", "week", "weeks"]],
	[30, ["luna", "luni", "month", "months"]],
];

const NEXT = ["viitoare", "viitor", "urmatoare", "urmator", "next"];
const LAST = ["trecuta", "trecut", "last", "previous"];
const THIS = ["asta", "aceasta", "acesta", "this", "curenta"];
const IN = ["peste", "in"];

function distance(a: string, b: string): number {
	if (Math.abs(a.length - b.length) > 1) return 2;
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i += 1) {
		let diagonal = row[0] ?? 0;
		row[0] = i;
		for (let j = 1; j <= b.length; j += 1) {
			const above = row[j] ?? 0;
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row[j] = Math.min((row[j - 1] ?? 0) + 1, above + 1, diagonal + cost);
			diagonal = above;
		}
	}
	return row[b.length] ?? 2;
}

function is(word: string, vocabulary: ReadonlyArray<string>): boolean {
	return vocabulary.some(
		(v) => v === word || (v.length >= 5 && word.length >= 5 && distance(word, v) <= 1),
	);
}

function plain(text: string): Array<string> {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, " ")
		.trim()
		.split(" ")
		.filter((w) => w !== "" && w !== "la" && w !== "pe" && w !== "on" && w !== "the");
}

function weekdayOf(word: string): number | undefined {
	const direct = WEEKDAYS.find(([, names]) => is(word, names));
	if (direct !== undefined) return direct[0];
	// Romanian definite forms: "joia", "vinerea", "martea", "miercurea".
	const forms = [word.replace(/a$/, ""), word.replace(/ea$/, "i")];
	return WEEKDAYS.find(([, names]) => forms.some((form) => names.includes(form)))?.[0];
}

function isoWeekday(date: string): number {
	return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

export function resolveDatePhrase(text: string, today: string): ResolvedDate {
	const trimmed = text.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { ok: true, kind: "day", date: trimmed };
	const words = plain(trimmed);
	const first = words[0];
	if (first === undefined) return { ok: false };
	const day = DAY_WORDS.find(([, names]) => is(first, names));
	if (day !== undefined && words.length === 1)
		return { ok: true, kind: "day", date: addDays(today, day[0]) };
	// "peste 2 saptamani", "in 3 days", "peste o luna"
	if (is(first, IN) && words.length >= 3) {
		const rawN = words[1] ?? "";
		const n = /^\d+$/.test(rawN) ? Number(rawN) : NUMBERS[rawN];
		const unit = UNITS.find(([, names]) => is(words[2] ?? "", names));
		if (n !== undefined && unit !== undefined && n >= 0 && n <= 365) {
			return { ok: true, kind: "day", date: addDays(today, n * unit[0]) };
		}
	}
	// "saptamana viitoare", "next week", "this week", "saptamana trecuta"
	const unitWeek = words.findIndex((w) => is(w, ["saptamana", "week"]));
	if (unitWeek >= 0) {
		const others = words.filter((_, i) => i !== unitWeek);
		const shift = others.some((w) => is(w, NEXT))
			? 7
			: others.some((w) => is(w, LAST))
				? -7
				: others.some((w) => is(w, THIS))
					? 0
					: undefined;
		if (shift !== undefined) {
			const monday = addDays(weekStart(today), shift);
			return { ok: true, kind: "week", date: monday, weekEnd: addDays(monday, 6) };
		}
	}
	// "joi", "joia viitoare", "next friday", "vineri trecuta"
	const named = words.map((w) => weekdayOf(w)).find((d) => d !== undefined);
	if (named !== undefined) {
		const modifiers = words.filter((w) => weekdayOf(w) === undefined);
		if (modifiers.some((w) => is(w, NEXT))) {
			return { ok: true, kind: "day", date: addDays(weekStart(today), 7 + named - 1) };
		}
		if (modifiers.some((w) => is(w, LAST))) {
			const back = (isoWeekday(today) - named + 7) % 7;
			return { ok: true, kind: "day", date: addDays(today, -(back === 0 ? 7 : back)) };
		}
		const ahead = (named - isoWeekday(today) + 7) % 7;
		return { ok: true, kind: "day", date: addDays(today, ahead) };
	}
	return { ok: false };
}
