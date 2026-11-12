import type { LanguagePack } from "../language/pack";
import { fold } from "../text/normalize";
import type { Sentences } from "../text/sentences";
import { withoutCitations } from "./ledger";

/** A figure: digits, with the separators a phone number, a date, a time or a price carries. */
const FIGURE = /\d(?:[\d.,:/–-]|\s(?=\d))*/g;

function figures(text: string): Array<string> {
	return [...text.matchAll(FIGURE)].map((m) => m[0].replace(/\D/g, "")).filter((d) => d !== "");
}

function wordsOf(text: string): Array<string> {
	return fold(text)
		.split(/[^a-z0-9]+/)
		.filter((w) => w !== "");
}

/** One sentence of a reply, with the whitespace before it. */
interface Chunk {
	lead: string;
	sentence: string;
}

function chunks(text: string, sentences: Sentences): Array<Chunk> {
	const out: Array<Chunk> = [];
	let start = 0;
	let carry = "";
	for (const end of [...sentences.ends(text), text.length]) {
		const raw = text.slice(start, end);
		start = end;
		const sentence = raw.trim();
		const lead = raw.slice(0, raw.length - raw.trimStart().length);
		if (sentence === "") {
			carry += raw;
			continue;
		}
		out.push({ lead: carry + lead, sentence });
		carry = "";
	}
	return out;
}

/** What a reply's factual claims are checked against: the tool results and the profile's text. */
export interface ClaimsEvidence {
	/** Everything the tools returned this turn. */
	passages: ReadonlyArray<string>;
	/** The profile's own text (voice, next steps) and earlier checked replies. */
	own: ReadonlyArray<string>;
}

export interface ClaimsVerdict {
	/** The sentences that state a fact nothing shown supports. */
	flagged: ReadonlyArray<string>;
	/** The reply without them, its whitespace kept. */
	kept: string;
}

export interface ClaimsCheck {
	/** `also` flags more sentences (a profile's cross-reference rule, say). */
	check(
		reply: string,
		evidence: ClaimsEvidence,
		also?: (sentence: string) => boolean,
	): ClaimsVerdict;
}

/**
 * The post-check on a reply's factual claims, never on its conversation: a sentence is flagged
 * when it carries a figure (a number, a price, a phone number, a date, a time) or a clinical,
 * price or effect term (the packs' `factTerms` and `claimMarkers`) that neither the tool results
 * nor the profile's own text contain. Warm words, questions and next steps pass untouched.
 */
export function createClaimsCheck(
	packs: ReadonlyArray<LanguagePack>,
	sentences: Sentences,
): ClaimsCheck {
	const terms = [
		...new Set(packs.flatMap((pack) => [...(pack.factTerms ?? []), ...(pack.claimMarkers ?? [])])),
	];
	const phrases = terms.filter((t) => t.includes(" "));
	const beginnings = terms.filter((t) => !t.includes(" "));
	return {
		check(reply, evidence, also) {
			const all = [...evidence.passages, ...evidence.own].join("\n");
			const shownFigures = figures(all);
			const shownWords = new Set(wordsOf(all));
			const shownText = ` ${wordsOf(all).join(" ")} `;
			const supportedFigure = (d: string): boolean => shownFigures.some((s) => s.includes(d));
			const supportedWord = (word: string, term: string): boolean =>
				shownWords.has(word) || [...shownWords].some((w) => w.startsWith(term));
			const unsupported = (sentence: string): boolean => {
				const plain = withoutCitations(sentence);
				if (figures(plain).some((d) => !supportedFigure(d))) return true;
				const folded = ` ${wordsOf(plain).join(" ")} `;
				if (phrases.some((p) => folded.includes(` ${p} `) && !shownText.includes(` ${p} `))) {
					return true;
				}
				for (const word of wordsOf(plain)) {
					const term = beginnings.find((t) => (t.length <= 3 ? word === t : word.startsWith(t)));
					if (term !== undefined && !supportedWord(word, term)) return true;
				}
				return false;
			};
			const flagged: Array<string> = [];
			let kept = "";
			let carry = "";
			for (const { lead, sentence } of chunks(reply, sentences)) {
				if (unsupported(sentence) || also?.(sentence) === true) {
					flagged.push(sentence);
					carry = carry === "" ? lead : carry;
					continue;
				}
				kept += `${kept === "" ? "" : carry || lead}${sentence}`;
				carry = "";
			}
			return { flagged, kept };
		},
	};
}
