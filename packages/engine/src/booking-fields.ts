import {
	AgeSchema,
	DetailsSchema,
	EmailSchema,
	NameSchema,
	normalisePhone,
} from "@psi/scheduling/domain";
import type {
	BookingDetails,
	BookingDetailsReport,
	DetailField,
	DetailsProblem,
	ForWhom,
} from "./booking-state";
import { fold } from "./text/normalize";

/**
 * Each mandatory field of a booking, read from what a visitor types in the chat and judged by the
 * very schemas the booking form and the store use (`@psi/scheduling`'s fields): a value that fails
 * them is never kept, and the failure is reported as a problem on that field. A field is read
 * strictly when it was just asked for (a bare "34" is an age; any short line is a name) and by
 * its own shape otherwise (a number followed by "ani", something with an "@", a run of digits).
 */

export interface FieldReading {
	values: BookingDetails;
	heard: BookingDetailsReport["heard"];
	/** Why the message's answer was not taken, when one was meant. */
	problem?: DetailsProblem;
	/**
	 * The message was an attempt at giving details (it carried a value, or something shaped like
	 * one): it is read as the answer before any other reading. Free text that merely failed to
	 * be the asked value is not, so a wish or a question in it is still heard.
	 */
	attempt: boolean;
}

const EMAIL_TOKEN = /\S*@\S*/;
const EMAIL_TRAIL = /[.,;:!?)\]>"”]+$/;
const EMAIL_LEAD = /^[(["“<]+/;
/** A run of digits with the separators people type, wherever it stands. */
const PHONE_RUN = /(?:\+|00)?\d[\d\s().-]{3,22}\d/;
const NUMBER = "-?\\d+(?:[.,]\\d+)?";
const AGE_YEARS = new RegExp(
	`(?<![\\d.,-])(${NUMBER})\\s*(?:de\\s+)?(?:ani|an|years?\\s+old|years?|yrs?|yo|y/o)(?![\\p{L}])`,
	"iu",
);
/** What an age written without being asked for must follow: a subject, so "de 2 ani" in a story is not one. */
const AGE_SUBJECT =
	/(?:^|[,;.]\s*|\b(?:am|are|aveam|avea|[iî]mplinit|sunt|is|has|i am|i m|aged?|v[aâ]rsta|fiica mea|fiul meu|copilul meu|copila mea|b[aă]iatul meu|fata mea|fetița mea|fetita mea|my son|my daughter|my child|he is|she is)\s+(?:de\s+)?)$/iu;
const AGE_LABEL = new RegExp(
	`(?:v[aâ]rst[aă]|age|aged)\\s*(?:mea|lui|ei|ei|is|of|de|:)?\\s*(${NUMBER})(?![\\d.,])`,
	"iu",
);
/** Words around a bare age answer ("am 34", "are 7 ani", "she is 7"): nothing else may be left. */
const AGE_WORDS = new Set(
	"am are e este ani an de varsta mea lui ei years year old yo is i m he she age aged copilul fiica fiul pentru mine al a".split(
		" ",
	),
);
const CONSENT =
	/\b(sunt de acord|ma declar de acord|imi dau acordul|consimt|accept|i agree|i consent|i accept)\b/;
const REFUSAL = /\b(nu sunt de acord|nu accept|nu consimt|do not agree|don t agree|i do not)\b/;
const TEEN = /\b(adolescent|adolescenta|adolescenti|teen|teenager|liceu|liceean|liceeana)\b/;
const CHILD =
	/\b(copil|copilul|copila|copilului|fiul|fiica|baiat|baiatul|fata|fetita|nepotul|nepoata|child|son|daughter|kid)\b/;
const ADULT = /\b(pentru mine|for me|for myself|adult|pentru mine insumi|pentru mine insami)\b/;
const LEADS: ReadonlyArray<ReadonlyArray<string>> = [
	["ma", "numesc"],
	["numele", "meu", "este"],
	["numele", "meu", "e"],
	["numele", "este"],
	["eu", "sunt"],
	["sunt"],
	["my", "name", "is"],
	["i", "am"],
	["i", "m"],
	["this", "is"],
];
/** Words that are not part of a name: answers, thanks and the labels people write before a value. */
const FILLER = new Set(
	"da nu ok okay bine mersi multumesc multumim buna salut hei hello hi pentru mine telefon telefonul numar numarul nr tel email mail adresa de este e al meu mea si sau cu la on the is my phone number address for me name numele nume sunt acord declar insumi insami consimt accept agree consent adult adolescent adolescenta teen copil copilul copila fiul fiica baiat baiatul fata fetita nepotul nepoata child son daughter kid yes sure".split(
		" ",
	),
);
/** Words of a question or a request: a line made of them is not a name. */
const NOT_A_NAME = new Set(
	"cat cum cand unde cine care ce de ce vreau vrei poti pot as aș doresc spuneti spune stiu pret pretul costa how what when where who why can could want would price cost please".split(
		" ",
	),
);
export const QUESTION_WORDS = /\b(cum|cat|cand|unde|de ce|cine|how|where|why|who|when)\b/;
const PLAIN_ANSWERS = new Set("da nu ok okay yes no sure mersi multumesc".split(" "));
const NAME_TOKEN = /^\p{Lu}[\p{L}'’-]+$/u;
const CONNECTOR = new Set(["de", "von", "van", "al", "el", "la", "di", "da", "du"]);
/** A name volunteered unasked is a handful of capitalised words; asked for, up to this many. */
const MAX_NAME_TOKENS = 4;
const MAX_ASKED_NAME_TOKENS = 6;
const MAX_NAME_TOKEN_LENGTH = 40;
/** A volunteered problem description: long enough to be a description and not an answer. */
const DESCRIPTION_MIN_WORDS = 6;
const DESCRIPTION_MIN_CHARS = 30;

const word = (t: string): string => fold(t).trim();
const squash = (text: string): string => text.replace(/\s+/g, " ").trim();
const trailingPunctuation = /[,;:!.?"“”()]+$/;

/** The age band a number of years falls in, as the booking form's audiences name them. */
export function audienceOfAge(years: number): ForWhom {
	if (years < 13) return "child";
	return years < 18 ? "teen" : "adult";
}

/**
 * Who a booking is for: a single-audience site always books that audience, otherwise the age
 * decides (and an audience the site does not serve falls to the site's first).
 */
export function audienceFor(years: number, audiences: ReadonlyArray<ForWhom> | undefined): ForWhom {
	const wanted = audienceOfAge(years);
	if (audiences === undefined || audiences.length === 0) return wanted;
	return audiences.includes(wanted) ? wanted : (audiences[0] ?? wanted);
}

function emailIn(text: string): { email?: string; problem?: DetailsProblem; rest: string } {
	const token = EMAIL_TOKEN.exec(text);
	if (token === null) return { rest: text };
	const candidate = token[0].replace(EMAIL_LEAD, "").replace(EMAIL_TRAIL, "");
	const rest = text.replace(token[0], " ");
	const parsed = EmailSchema.safeParse(candidate);
	if (parsed.success) return { email: parsed.data, rest };
	const typo = parsed.error.issues
		.map((issue) => issue.message)
		.find((message) => message.startsWith("typo:"));
	return {
		problem:
			typo === undefined
				? { field: "email", code: "invalid" }
				: { field: "email", code: "typo", suggestion: typo.slice("typo:".length) },
		rest,
	};
}

function phoneIn(
	text: string,
	asked: boolean,
): { phone?: string; problem?: DetailsProblem; rest: string } {
	const run = PHONE_RUN.exec(text);
	if (run === null) return { rest: text };
	const digits = run[0].replace(/\D/g, "").length;
	const rest = text.replace(run[0], " ");
	const phone = normalisePhone(run[0]);
	if (phone !== undefined) return { phone, rest };
	// Short runs are numbers of another kind (a date, a count); a run the length of a phone is one.
	return digits >= (asked ? 4 : 7)
		? { problem: { field: "phone", code: "invalid" }, rest }
		: { rest: text };
}

function ageIn(
	text: string,
	asked: boolean,
): { age?: number; problem?: DetailsProblem; rest: string } {
	const years = AGE_YEARS.exec(text);
	const spoken =
		years !== null && (asked || AGE_SUBJECT.test(text.slice(0, years.index))) ? years : null;
	const found = spoken ?? AGE_LABEL.exec(text);
	if (found === null) return { rest: text };
	const rest = text.replace(found[0], " ");
	const parsed = AgeSchema.safeParse((found[1] ?? "").replace(",", "."));
	return parsed.success
		? { age: parsed.data, rest }
		: { problem: { field: "age", code: "invalid" }, rest };
}

/** The answer to "how old?": a number, with only the words people put around it. */
function bareAge(text: string): { age?: number; problem?: DetailsProblem } {
	const found = new RegExp(NUMBER).exec(text);
	if (found === null) return { problem: { field: "age", code: "invalid" } };
	const around = fold(text.replace(found[0], " "))
		.split(" ")
		.filter((w) => w !== "" && !AGE_WORDS.has(w));
	const parsed = AgeSchema.safeParse(found[0].replace(",", "."));
	if (around.length > 0 || !parsed.success) return { problem: { field: "age", code: "invalid" } };
	return { age: parsed.data };
}

/** The words after a lead ("mă numesc …", "my name is …") that look like a name. */
function introducedName(text: string): { name: string; removed: string } | undefined {
	const tokens = text.split(" ");
	const words = tokens.map((t) => word(t).split(" ").filter(Boolean));
	const flat = words.flatMap((ws, i) => ws.map((w) => ({ w, i })));
	for (let at = 0; at < flat.length; at += 1) {
		const lead = LEADS.find((phrase) => phrase.every((w, k) => flat[at + k]?.w === w));
		if (lead === undefined) continue;
		const last = flat[at + lead.length - 1];
		if (last === undefined) continue;
		const picked: string[] = [];
		for (const raw of tokens.slice(last.i + 1)) {
			const clean = raw.replace(trailingPunctuation, "");
			const named = NAME_TOKEN.test(clean) || (picked.length > 0 && CONNECTOR.has(word(clean)));
			if (!named || picked.length >= MAX_NAME_TOKENS) break;
			picked.push(clean);
			if (clean !== raw) break;
		}
		const head = picked[0];
		if (head !== undefined && NAME_TOKEN.test(head)) {
			while (picked.length > 0 && CONNECTOR.has(word(picked[picked.length - 1] ?? "")))
				picked.pop();
			const first = flat[at]?.i ?? 0;
			const end = last.i + 1 + picked.length;
			return { name: picked.join(" "), removed: tokens.slice(first, end).join(" ") };
		}
	}
	return undefined;
}

/** A message that is nothing but a name: capitalised words, no fillers (a lower-case line is not taken). */
function bareName(text: string): string | undefined {
	const tokens = text
		.replace(/[,;:!"“”()]+/g, " ")
		.split(/\s+/)
		.filter((t) => t !== "" && !FILLER.has(word(t)));
	const first = tokens[0];
	if (tokens.length === 0 || tokens.length > MAX_NAME_TOKENS || first === undefined)
		return undefined;
	const named = tokens.every((t) => NAME_TOKEN.test(t) || CONNECTOR.has(word(t)));
	return named && NAME_TOKEN.test(first) ? tokens.join(" ") : undefined;
}

/** The answer to "what is your name?": a short line of letters, in any case or script. */
function askedName(text: string): { name?: string; problem?: DetailsProblem } {
	const invalid = { problem: { field: "name", code: "invalid" } } as const;
	if (text.includes("?")) return invalid;
	const introduced = introducedName(text);
	const lead = introduced?.name;
	const raw = lead ?? text;
	const tokens = raw
		.replace(/[,;:!?"“”()]+/g, " ")
		.split(/\s+/)
		.filter((t) => t !== "");
	const lead0 = tokens.findIndex((t) => !FILLER.has(word(t)));
	// Words that are only fillers ("Al", "Da") are a name unless they are a plain yes or no.
	const plain = tokens.length === 1 && PLAIN_ANSWERS.has(word(tokens[0] ?? ""));
	const start = lead !== undefined ? 0 : lead0 >= 0 ? lead0 : plain ? -1 : 0;
	const named = start < 0 ? [] : tokens.slice(start);
	const long = named.some((t) => t.length > MAX_NAME_TOKEN_LENGTH);
	const lowered = named.filter((t) => !NAME_TOKEN.test(t));
	if (lead === undefined && lowered.some((t) => NOT_A_NAME.has(word(t)))) return invalid;
	if (named.length === 0 || named.length > MAX_ASKED_NAME_TOKENS || long) return invalid;
	const parsed = NameSchema.safeParse(named.join(" "));
	return parsed.success ? { name: parsed.data } : invalid;
}

function forWhomIn(folded: string): ForWhom | undefined {
	if (TEEN.test(folded)) return "teen";
	if (CHILD.test(folded)) return "child";
	return ADULT.test(folded) ? "adult" : undefined;
}

/** Words that say a clause is about the person's trouble, not a field's label or a wish to book. */
const PROBLEM_CUE =
	/\b(nu pot|nu dorm|nu mai|simt|simte|sufar|suferit|anxiet|depresi|panic|stres|somn|neliniste|frica|plange|refuza|probleme|problema|dificult|copilul meu|fiica mea|fiul meu|trouble|problem|struggl|worr|anxi|depress|sleep|feel|afraid|scared|stress|my (?:son|daughter|child))\w*/;
/** Labels of the other fields: a clause that carries one is a field, not a description. */
const FIELD_LABEL =
	/\b(nume|numele|telefon|telefonul|numar|email|mail|adresa|varsta|name|phone|number|address|age)\b/;
const CLAUSE_LEAD = /^(?:si|și|iar|dar|and|but)\s+/iu;

/**
 * A description the visitor volunteered: one clause of the message, once the other pieces are
 * out, long enough to describe something and carrying a word about the trouble itself.
 */
function description(rest: string): string | undefined {
	const clauses = rest
		.split(/[,;.!\n]+/)
		.map((c) => squash(c).replace(CLAUSE_LEAD, ""))
		.filter((c) => {
			const folded = fold(c);
			const count = c.split(" ").filter((w) => /\p{L}/u.test(w)).length;
			return (
				count >= DESCRIPTION_MIN_WORDS &&
				c.length >= DESCRIPTION_MIN_CHARS &&
				!c.includes("?") &&
				PROBLEM_CUE.test(folded) &&
				!FIELD_LABEL.test(folded)
			);
		});
	return clauses.sort((a, b) => b.length - a.length)[0];
}

/** The answer to "what is going on?": the whole message, held to the form's own limits. */
function askedDetails(text: string): { details?: string; problem?: DetailsProblem } {
	const parsed = DetailsSchema.safeParse(text);
	return parsed.success
		? { details: parsed.data }
		: { problem: { field: "details", code: "invalid" } };
}

/**
 * What a message tells, merged over what was known: a new valid piece replaces the old one, and a
 * piece that fails the field's rules is reported (`problem`) and kept out. `asked` is the field the
 * guide asked for last, which a bare answer is read as. `audiences` are the site's own, which
 * decide `forWhom` from the age.
 */
export function readFields(
	typed: string,
	known: BookingDetails,
	asked: DetailField | undefined,
	audiences?: ReadonlyArray<ForWhom>,
): FieldReading {
	const values: { -readonly [K in keyof BookingDetails]: BookingDetails[K] } = { ...known };
	const heard: Array<FieldReading["heard"][number]> = [];
	const problems: DetailsProblem[] = [];
	let attempt = false;
	const text = typed.replace(/\r\n?/g, "\n");
	const finish = (): FieldReading => {
		if (values.age !== undefined) values.forWhom = audienceFor(values.age, audiences);
		const problem = problems[0];
		return {
			values,
			heard,
			attempt: attempt || heard.length > 0,
			...(problem === undefined ? {} : { problem }),
		};
	};
	if (asked === "details") {
		attempt = true;
		const answer = askedDetails(text);
		if (answer.details !== undefined) {
			values.details = answer.details;
			heard.push("details");
		} else if (answer.problem !== undefined) problems.push(answer.problem);
		return finish();
	}
	let rest = squash(text);
	const mail = emailIn(rest);
	rest = mail.rest;
	if (mail.email !== undefined) {
		values.email = mail.email;
		heard.push("email");
	} else if (mail.problem !== undefined) {
		attempt = true;
		problems.push(mail.problem);
	}
	const years = ageIn(rest, asked === "age");
	rest = years.rest;
	if (years.age !== undefined) {
		values.age = years.age;
		heard.push("age");
	} else if (years.problem !== undefined) {
		attempt = true;
		problems.push(years.problem);
	}
	const call = phoneIn(rest, asked === "phone");
	rest = call.rest;
	if (call.phone !== undefined) {
		values.phone = call.phone;
		heard.push("phone");
	} else if (call.problem !== undefined) {
		attempt = true;
		problems.push(call.problem);
	}
	if (asked === "age" && years.age === undefined && years.problem === undefined) {
		const bare = bareAge(rest);
		if (bare.age !== undefined) {
			values.age = bare.age;
			heard.push("age");
		} else if (heard.length === 0 && bare.problem !== undefined) {
			// A line with no letters at all ("-1", "7.5", "") is an attempt at a number.
			attempt = attempt || !/\p{L}/u.test(rest);
			problems.push(bare.problem);
		}
	}
	const folded = fold(rest);
	if (CONSENT.test(folded) && !REFUSAL.test(folded)) values.consent = true;
	const who = forWhomIn(folded);
	if (who !== undefined && values.age === undefined) {
		values.forWhom = who;
		heard.push("forWhom");
	}
	const introduced = introducedName(rest);
	const lead = introduced?.name;
	const named =
		asked === "name" && lead === undefined
			? askedName(rest)
			: { name: lead ?? (known.name === undefined ? bareName(rest) : undefined) };
	const parsedName = named.name === undefined ? undefined : NameSchema.safeParse(named.name);
	if (parsedName?.success === true) {
		values.name = parsedName.data;
		heard.push("name");
		rest = introduced === undefined ? "" : rest.replace(introduced.removed, " ");
	} else if ("problem" in named && named.problem !== undefined && heard.length === 0) {
		problems.push(named.problem);
	}
	if (asked !== "name" || heard.includes("name")) {
		const told = known.details === undefined ? description(rest) : undefined;
		if (told !== undefined && !heard.includes("details")) {
			const parsed = DetailsSchema.safeParse(told);
			if (parsed.success) {
				values.details = parsed.data;
				heard.push("details");
			} else problems.push({ field: "details", code: "invalid" });
		}
	}
	if (
		asked !== undefined &&
		!heard.includes(asked) &&
		heard.length === 0 &&
		problems.length === 0
	) {
		problems.push({ field: asked, code: "invalid" });
	}
	return finish();
}

/** What is still needed before the summary, in the order it is asked. */
export function missingDetails(values: BookingDetails): ReadonlyArray<DetailField> {
	const present: Readonly<Record<DetailField, boolean>> = {
		name: values.name !== undefined,
		age: values.age !== undefined,
		details: values.details !== undefined,
		phone: values.phone !== undefined,
		email: values.email !== undefined,
	};
	return (["name", "age", "details", "phone", "email"] as const).filter((f) => !present[f]);
}
