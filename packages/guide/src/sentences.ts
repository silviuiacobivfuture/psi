import { fold } from "./guardrails/normalize";

/**
 * Where sentences end in answer text, for the answer gate (which releases a sentence at a time)
 * and the faithfulness checks (which assess a sentence at a time). A sentence ends at `.`, `!`,
 * `?` or `…` followed by whitespace, and at a newline; a full stop after an abbreviation ("dr.",
 * "str.", "nr.", "e.g.") or an initial ("A. Popescu") does not end one.
 */
const END = /[.!?…](?=\s)|\n/g;

/** Romanian and English abbreviations that take a full stop mid-sentence (folded, without it). */
const ABBREVIATIONS = new Set([
	"dr",
	"dra",
	"drd",
	"prof",
	"conf",
	"lect",
	"asist",
	"psih",
	"ing",
	"av",
	"str",
	"nr",
	"bd",
	"bdul",
	"bl",
	"sc",
	"et",
	"ap",
	"jud",
	"mun",
	"sect",
	"tel",
	"cca",
	"ex",
	"pag",
	"art",
	"etc",
	"e.g",
	"i.e",
	"mr",
	"mrs",
	"ms",
	"st",
	"vs",
	"approx",
]);

const LAST_TOKEN = /(\S+)$/;

function endsAbbreviation(before: string): boolean {
	const token = LAST_TOKEN.exec(before)?.[1] ?? "";
	if (/^\p{Lu}$/u.test(token)) return true;
	return ABBREVIATIONS.has(fold(token).trim());
}

/** The offsets just after each sentence end in the text. */
export function sentenceEnds(text: string): Array<number> {
	const ends: Array<number> = [];
	for (const match of text.matchAll(END)) {
		if (match[0] === "." && endsAbbreviation(text.slice(0, match.index))) continue;
		ends.push(match.index + match[0].length);
	}
	return ends;
}

/** Splits text into trimmed, non-empty sentences. */
export function splitSentences(text: string): Array<string> {
	const out: Array<string> = [];
	let start = 0;
	for (const end of [...sentenceEnds(text), text.length]) {
		const sentence = text.slice(start, end).trim();
		if (sentence.length > 0) out.push(sentence);
		start = end;
	}
	return out;
}
