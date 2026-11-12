import type { LanguagePack } from "./language/pack";
import { fold } from "./text/normalize";

/** Longer than this, a message is a question, not small talk. */
const MAX_WORDS = 12;

function words(text: string): Array<string> {
	return fold(text)
		.split(/[^a-z0-9]+/)
		.filter((w) => w !== "");
}

/** Edit distance at most one (a typo: one letter added, dropped, changed or two swapped). */
function nearlyEqual(a: string, b: string): boolean {
	if (a === b) return true;
	if (Math.abs(a.length - b.length) > 1) return false;
	if (a.length === b.length) {
		const diff = [...a].map((ch, i) => (ch === b[i] ? -1 : i)).filter((i) => i >= 0);
		if (diff.length === 1) return true;
		const [i, j] = diff;
		return diff.length === 2 && i !== undefined && j === i + 1 && a[i] === b[j] && a[j] === b[i];
	}
	const [short, long] = a.length < b.length ? [a, b] : [b, a];
	for (let i = 0; i < long.length; i += 1) {
		if (long.slice(0, i) + long.slice(i + 1) === short) return true;
	}
	return false;
}

export interface SmallTalk {
	/** True when the message is only small talk: greetings, thanks, "who are you", "can we talk". */
	is(text: string): boolean;
	/** True when the message names something beyond small talk and function words: a topic. */
	hasDomainTerms(text: string): boolean;
	/** True when the small talk is a thank-you. */
	isThanks(text: string): boolean;
}

/**
 * Small talk in the packs' languages, by vocabulary rather than fixed phrases, so punctuation,
 * missing diacritics, word order and a one-letter typo ("helo", "multumsc") do not matter. A
 * message is small talk when every word is in the packs' small-talk vocabulary (or one typo away
 * from a word of four letters or more) and it has at most twelve words; any other word makes it
 * a question. The packs' `smallTalk` patterns still count.
 */
export function createSmallTalk(packs: ReadonlyArray<LanguagePack>): SmallTalk {
	const thanks = new Set(packs.flatMap((pack) => pack.thanksWords ?? []));
	const vocabulary = new Set([...packs.flatMap((pack) => pack.smallTalkWords ?? []), ...thanks]);
	const stopwords = new Set(packs.flatMap((pack) => pack.stopwords));
	const patterns = packs.flatMap((pack) => pack.smallTalk ?? []);
	const long = [...vocabulary].filter((w) => w.length >= 4);
	const known = (w: string): boolean =>
		vocabulary.has(w) || (w.length >= 4 && long.some((v) => nearlyEqual(w, v)));
	return {
		is(text) {
			const folded = fold(text);
			if (patterns.some((p) => p.test(folded))) return true;
			const all = words(text);
			return all.length > 0 && all.length <= MAX_WORDS && vocabulary.size > 0 && all.every(known);
		},
		isThanks(text) {
			const all = words(text);
			const longThanks = [...thanks].filter((w) => w.length >= 4);
			const isThank = (w: string): boolean =>
				thanks.has(w) || (w.length >= 4 && longThanks.some((v) => nearlyEqual(w, v)));
			return all.length > 0 && all.length <= MAX_WORDS && all.every(known) && all.some(isThank);
		},
		hasDomainTerms(text) {
			return words(text).some((w) => w.length >= 3 && !stopwords.has(w) && !known(w));
		},
	};
}
