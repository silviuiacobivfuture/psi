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

const MONTHS: ReadonlyArray<readonly [number, ReadonlyArray<string>]> = [
	[1, ["ianuarie", "january", "jan"]],
	[2, ["februarie", "february", "feb"]],
	[3, ["martie", "march", "mar"]],
	[4, ["aprilie", "april", "apr"]],
	[5, ["mai", "may"]],
	[6, ["iunie", "june", "jun"]],
	[7, ["iulie", "july", "jul"]],
	[8, ["august", "aug"]],
	[9, ["septembrie", "september", "sep"]],
	[10, ["octombrie", "october", "oct"]],
	[11, ["noiembrie", "november", "nov"]],
	[12, ["decembrie", "december", "dec"]],
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
	// "1 decembrie", "1 decembrie 2026", "dec 1": a day and a month name; the year is the nearest one not in the past.
	const monthAt = words.findIndex((w) =>
		MONTHS.some(([, names]) => names.includes(w) || (w.length >= 5 && is(w, names))),
	);
	if (monthAt >= 0) {
		const month = MONTHS.find(([, names]) =>
			names.some((n) => n === words[monthAt] || (n.length >= 5 && is(words[monthAt] ?? "", [n]))),
		)?.[0];
		const numbers = words
			.filter((_, i) => i !== monthAt)
			.filter((w) => /^\d{1,4}$/.test(w))
			.map(Number);
		const dayNo = numbers.find((n) => n >= 1 && n <= 31);
		const yearNo = numbers.find((n) => n >= 2000 && n <= 2100);
		if (month !== undefined && dayNo !== undefined) {
			const pad = (n: number): string => String(n).padStart(2, "0");
			const year = yearNo ?? Number(today.slice(0, 4));
			let date = `${year}-${pad(month)}-${pad(dayNo)}`;
			if (yearNo === undefined && date < today) date = `${year + 1}-${pad(month)}-${pad(dayNo)}`;
			if (
				!Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
				new Date(`${date}T00:00:00Z`).getUTCDate() === dayNo
			) {
				return { ok: true, kind: "day", date };
			}
		}
	}
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
