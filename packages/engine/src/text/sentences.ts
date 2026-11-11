import { fold } from "./normalize";

/**
 * Where sentences end in answer text, for the answer gate (which releases a sentence at a time)
 * and the faithfulness checks (which assess a sentence at a time). A sentence ends at `.`, `!`,
 * `?` or `…` followed by whitespace, and at a newline; a full stop after one of the language
 * packs' abbreviations ("dr.", "str.", "e.g.") or an initial ("A. Popescu") does not end one.
 */
const END = /[.!?…](?=\s)|\n/g;
const LAST_TOKEN = /(\S+)$/;

export interface Sentences {
	/** The offsets just after each sentence end in the text. */
	ends(text: string): Array<number>;
	/** Splits text into trimmed, non-empty sentences. */
	split(text: string): Array<string>;
}

export function createSentences(abbreviations: Iterable<string>): Sentences {
	const known = new Set(abbreviations);
	const endsAbbreviation = (before: string): boolean => {
		const token = LAST_TOKEN.exec(before)?.[1] ?? "";
		if (/^\p{Lu}$/u.test(token)) return true;
		return known.has(fold(token).trim());
	};
	const ends = (text: string): Array<number> => {
		const out: Array<number> = [];
		for (const match of text.matchAll(END)) {
			if (match[0] === "." && endsAbbreviation(text.slice(0, match.index))) continue;
			out.push(match.index + match[0].length);
		}
		return out;
	};
	return {
		ends,
		split(text) {
			const out: Array<string> = [];
			let start = 0;
			for (const end of [...ends(text), text.length]) {
				const sentence = text.slice(start, end).trim();
				if (sentence.length > 0) out.push(sentence);
				start = end;
			}
			return out;
		},
	};
}
