import type { PartOfDay } from "./booking-state";
import { addLocalDays } from "./scheduling/local-time";
import type { SchedulingMode } from "./scheduling/port";
import { fold } from "./text/normalize";

/**
 * What a visitor's message says about a booking, read without a model: the day, the part of the
 * day, the mode, a time, "the second one", "other days", a cancellation. Romanian and English; the
 * text is folded (no diacritics, lower case). A field is set only when the message says it, so a
 * refinement changes only what was named. Nothing here reads a name, a phone or an e-mail.
 */
export interface Wish {
	/** "the second one": 1-based, or -1 for the last. */
	ordinal?: number;
	/** ISO weekday, 1 Monday to 7 Sunday. */
	weekday?: number;
	/** A clock time named, in minutes after midnight. */
	minutes?: number;
	/** First local day to look at, `YYYY-MM-DD`. */
	fromDate?: string;
	/** How many days from `fromDate`. */
	days?: number;
	partOfDay?: PartOfDay;
	mode?: SchedulingMode;
	/** "other days", "something later": look past what was shown. */
	later?: boolean;
	/** "any day", "it doesn't matter": drop the day and part-of-day limits. */
	anything?: boolean;
	/** "which services do you have". */
	asksServices?: boolean;
	/** A service named, by its slug or a word for it. */
	service?: string;
}

/** The booking references and cancel codes a message carries, canonical or as typed. */
export interface Codes {
	reference?: string;
	cancelCode?: string;
}

const MONTHS: Readonly<Record<string, number>> = {
	ianuarie: 1,
	februarie: 2,
	martie: 3,
	aprilie: 4,
	mai: 5,
	iunie: 6,
	iulie: 7,
	august: 8,
	septembrie: 9,
	octombrie: 10,
	noiembrie: 11,
	decembrie: 12,
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

const WEEKDAYS: Readonly<Record<string, number>> = {
	luni: 1,
	marti: 2,
	miercuri: 3,
	joi: 4,
	vineri: 5,
	sambata: 6,
	duminica: 7,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
	sunday: 7,
};

const ORDINALS: ReadonlyArray<readonly [RegExp, number]> = [
	[/\b(ultima|ultimul|last)\b/, -1],
	[/\b(prima|primul|first|1st|earliest|cea mai devreme)\b/, 1],
	[/\b(a doua|al doilea|second|2nd)\b/, 2],
	[/\b(a treia|al treilea|third|3rd)\b/, 3],
	[/\b(a patra|al patrulea|fourth|4th)\b/, 4],
	[/\b(a cincea|al cincilea|fifth|5th)\b/, 5],
	[/\b(a sasea|al saselea|sixth|6th)\b/, 6],
	[/\b(?:optiunea|varianta|numarul|nr|option|number|no) ?(\d)\b/, 0],
];

const SERVICE_WORDS: Readonly<Record<string, RegExp>> = {
	evaluation: /\b(evaluar\w*|evaluation|assessment)\b/,
};

const CANCEL_INTENT: ReadonlyArray<RegExp> = [
	/\b(vreau|as vrea|doresc|as dori|trebuie|vrem|am nevoie|pot|putem|se poate)\b.{0,25}\b(sa )?(anulez|anulam|anulare|renunt|renuntam|sterg)\b/,
	/\b(anuleaza|anulati|anulare|anulez|anulam) (programarea|cererea|rezervarea|ora)\b/,
	/\b(want|need|like|wish|have|ve got) to cancel\b/,
	/\bcancel (my|the|our|this) (appointment|booking|request|evaluation|reservation)\b/,
	/\b(can|could|may) (i|we) cancel\b/,
];

/** True when the message asks to cancel a request (not a question about how cancelling works). */
export function isCancelIntent(question: string): boolean {
	const folded = fold(question);
	return CANCEL_INTENT.some((rule) => rule.test(folded));
}

const DASHED = /\b[0-9A-Za-z]{4}(?:-[0-9A-Za-z]{4}){1,3}\b/g;
const COMPACT = /\b[0-9A-Za-z]{8}(?:[0-9A-Za-z]{8})?\b/g;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function canon(typed: string): string {
	return typed.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

function inAlphabet(code: string): boolean {
	return [...code].every((char) => ALPHABET.includes(char));
}

/**
 * The reference (8 characters, `K7M3-9QXA`) and the cancel code (16, `XXXX-XXXX-XXXX-XXXX`) in a
 * message, as typed with dashes, or run together when they hold a digit (so a word never reads as
 * one). The store canonicalises and checks them; this only finds them.
 */
export function findCodes(question: string): Codes {
	const found: Codes = {};
	const dashed = question.match(DASHED) ?? [];
	const compact = (question.match(COMPACT) ?? []).filter((token) => /\d/.test(token));
	for (const token of [...dashed, ...compact]) {
		const code = canon(token);
		if (!inAlphabet(code)) continue;
		if (code.length === 8 && found.reference === undefined) found.reference = token;
		if (code.length === 16 && found.cancelCode === undefined) found.cancelCode = token;
	}
	return found;
}

function isoWeekday(date: string): number {
	const day = new Date(`${date}T00:00:00Z`).getUTCDay();
	return day === 0 ? 7 : day;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** A day and month to the next such date on or after `today`. */
function nextDate(today: string, day: number, month: number): string | undefined {
	const year = Number(today.slice(0, 4));
	for (const y of [year, year + 1]) {
		const date = `${y}-${pad(month)}-${pad(day)}`;
		const parsed = new Date(`${date}T00:00:00Z`);
		if (parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) continue;
		if (date >= today) return date;
	}
	return undefined;
}

interface DateRead {
	fromDate?: string;
	days?: number;
	rest: string;
}

/** Reads a named date or a relative day or week; returns the text with what it read removed. */
function readDate(folded: string, today: string): DateRead {
	let rest = folded;
	const take = (pattern: RegExp): RegExpMatchArray | null => {
		const hit = rest.match(pattern);
		if (hit !== null) rest = rest.replace(pattern, " ");
		return hit;
	};
	const monthNames = Object.keys(MONTHS).join("|");
	const dayMonth = take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? (${monthNames})\\b`));
	if (dayMonth?.[1] !== undefined && dayMonth[2] !== undefined) {
		const date = nextDate(today, Number(dayMonth[1]), MONTHS[dayMonth[2]] ?? 0);
		if (date !== undefined) return { fromDate: date, days: 1, rest };
	}
	const monthDay = take(new RegExp(`\\b(${monthNames}) (\\d{1,2})(?:st|nd|rd|th)?\\b`));
	if (monthDay?.[1] !== undefined && monthDay[2] !== undefined) {
		const date = nextDate(today, Number(monthDay[2]), MONTHS[monthDay[1]] ?? 0);
		if (date !== undefined) return { fromDate: date, days: 1, rest };
	}
	const numeric = rest.match(/(?<!\b(?:la|ora|at) )\b(\d{1,2})[./](\d{1,2})\b/);
	if (numeric?.[1] !== undefined && numeric[2] !== undefined) {
		const day = Number(numeric[1]);
		const month = Number(numeric[2]);
		const date = month >= 1 && month <= 12 ? nextDate(today, day, month) : undefined;
		if (date !== undefined) {
			rest = rest.replace(numeric[0], " ");
			return { fromDate: date, days: 1, rest };
		}
	}
	if (take(/\b(poimaine|day after tomorrow)\b/) !== null) {
		return { fromDate: addLocalDays(today, 2), days: 1, rest };
	}
	if (take(/\b(maine|tomorrow)\b/) !== null) {
		return { fromDate: addLocalDays(today, 1), days: 1, rest };
	}
	if (take(/\b(azi|astazi|today)\b/) !== null) return { fromDate: today, days: 1, rest };
	if (take(/\b(luna viitoare|luna urmatoare|next month)\b/) !== null) {
		const [year = 1970, month = 1] = today.split("-").map(Number);
		const first = `${month === 12 ? year + 1 : year}-${pad(month === 12 ? 1 : month + 1)}-01`;
		return { fromDate: first, days: 14, rest };
	}
	if (
		take(/\bsaptamana (viitoare|urmatoare|care vine)\b|\bnext week\b|\bpeste o saptamana\b/) !==
		null
	) {
		const monday = addLocalDays(today, 8 - isoWeekday(today));
		return { fromDate: monday, days: 7, rest };
	}
	if (take(/\bsaptamana (aceasta|asta|curenta)\b|\bthis week\b/) !== null) {
		return { fromDate: today, days: Math.max(1, 8 - isoWeekday(today)), rest };
	}
	return { rest };
}

/** A clock time the message names ("la 10", "10:30", "2 pm"), in minutes after midnight. */
function readMinutes(text: string): number | undefined {
	const clock = text.match(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/);
	const meridiem = text.match(/\b(1[0-2]|[1-9]) ?(am|pm)\b/);
	const plain = text.match(/\b(?:la|ora|at|@) ?(?:ora )?([01]?\d|2[0-3])\b(?! ?[:.]\d)/);
	if (clock?.[1] !== undefined && clock[2] !== undefined) {
		const hour = Number(clock[1]);
		return (hour < 8 ? hour + 12 : hour) * 60 + Number(clock[2]);
	}
	if (meridiem?.[1] !== undefined) {
		const hour = Number(meridiem[1]) % 12;
		return (meridiem[2] === "pm" ? hour + 12 : hour) * 60;
	}
	if (plain?.[1] !== undefined) {
		const hour = Number(plain[1]);
		return (hour < 8 && hour > 0 ? hour + 12 : hour) * 60;
	}
	return undefined;
}

function readPartOfDay(folded: string): PartOfDay | undefined {
	if (/\b(dimineata|dimineti|morning|mornings)\b/.test(folded)) return "morning";
	if (/\b(dupa amiaza|dupa masa|dupa pranz|afternoon|afternoons)\b/.test(folded))
		return "afternoon";
	if (/\b(seara|searile|evening|evenings)\b/.test(folded)) return "evening";
	return undefined;
}

function readMode(folded: string, refining: boolean): SchedulingMode | undefined {
	if (
		/\b(la cabinet|la clinica|la sediu|in persoana|fizic|onsite|on site|in person|face to face)\b/.test(
			folded,
		)
	) {
		return "onsite";
	}
	if (/\b(la distanta|via video|video call|pe zoom|prin video|pe video)\b/.test(folded)) {
		return "online";
	}
	// "online" alone can mean the booking channel ("book online"): a mode only in a refinement
	// or beside the thing being booked.
	if (
		/\b(evaluare|consultatie|sedinta|sesiune|intalnire|evaluation|session|meeting)\b.{0,12}\bonline\b|\bonline (evaluation|session|meeting|consultation)\b/.test(
			folded,
		)
	) {
		return "online";
	}
	return refining && /\bonline\b/.test(folded) ? "online" : undefined;
}

function readOrdinal(folded: string): number | undefined {
	for (const [rule, value] of ORDINALS) {
		const hit = folded.match(rule);
		if (hit === null) continue;
		if (value !== 0) return value;
		const n = Number(hit[1]);
		return n >= 1 ? n : undefined;
	}
	return undefined;
}

const GENERIC = new Set([
	"serviciu",
	"service",
	"sedinta",
	"session",
	"programare",
	"initiala",
	"initial",
	"prima",
	"first",
]);

function tokensOf(name: { ro: string; en: string }): string[] {
	return [...new Set([...fold(name.ro).split(" "), ...fold(name.en).split(" ")])].filter(
		(t) => t.length >= 5 && !GENERIC.has(t),
	);
}

/**
 * The words that name one service in a message: its full name in either language, or a distinctive
 * word of it that no other service's name shares ("neurofeedback" in "Sedinta de neurofeedback").
 */
export function serviceWords(
	slug: string,
	names: Readonly<Record<string, { ro: string; en: string }>>,
): RegExp | undefined {
	const own = names[slug];
	if (own === undefined) return undefined;
	const others = new Set(
		Object.entries(names)
			.filter(([k]) => k !== slug)
			.flatMap(([, n]) => tokensOf(n)),
	);
	const quote = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = [fold(own.ro), fold(own.en), ...tokensOf(own).filter((t) => !others.has(t))].filter(
		(x) => x !== "",
	);
	return parts.length === 0 ? undefined : new RegExp(`\\b(${parts.map(quote).join("|")})\\b`);
}

/**
 * Reads what the message says about the booking. `today` is the local day (`YYYY-MM-DD`) that
 * "tomorrow" and "next week" count from; `refining` is true inside a booking conversation, where
 * a bare "online" or a bare weekday is a refinement and not part of another sentence.
 */
export function readWish(
	question: string,
	today: string,
	services: ReadonlyArray<string>,
	refining: boolean,
	names: Readonly<Record<string, { ro: string; en: string }>> = {},
): Wish {
	const folded = fold(question)
		.replace(/\bbuna (dimineata|ziua|seara)\b/g, " ")
		.replace(/\bgood (morning|afternoon|evening|day)\b/g, " ");
	const wish: Wish = {};
	const read = readDate(folded, today);
	if (read.fromDate !== undefined) {
		wish.fromDate = read.fromDate;
		if (read.days !== undefined) wish.days = read.days;
	}
	const text = read.rest;
	for (const [name, weekday] of Object.entries(WEEKDAYS)) {
		if (new RegExp(`\\b${name}\\b`).test(text)) wish.weekday = weekday;
	}
	const minutes = readMinutes(text);
	if (minutes !== undefined) wish.minutes = minutes;
	const part = readPartOfDay(text);
	if (part !== undefined) wish.partOfDay = part;
	const mode = readMode(text, refining);
	if (mode !== undefined) wish.mode = mode;
	const ordinal = readOrdinal(text);
	if (ordinal !== undefined) wish.ordinal = ordinal;
	if (
		/\b(alta zi|alte zile|another day|other days|alte ore|alte variante|alte optiuni|alt interval|other times|other options|something else|something later|mai tarziu|later|altceva)\b/.test(
			text,
		)
	) {
		wish.later = true;
	}
	if (
		/\b(oricand|orice zi|orice ora|any day|any time|anytime|whenever|nu conteaza|no preference|doesn t matter)\b/.test(
			text,
		)
	) {
		wish.anything = true;
	}
	if (
		/\b(ce|care|what|which) (alte )?(servicii|tipuri|tip de|fel de|services|types|kinds)\b|\b(ce|care) (serviciu|service)\b/.test(
			text,
		)
	) {
		wish.asksServices = true;
	}
	for (const slug of services) {
		const word = SERVICE_WORDS[slug] ?? serviceWords(slug, names);
		if (word?.test(text) === true || text.includes(` ${slug} `)) wish.service = slug;
	}
	return wish;
}
