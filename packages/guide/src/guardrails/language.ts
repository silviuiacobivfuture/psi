import type { Locale } from "../contract";
import { fold } from "./normalize";

/**
 * What language a piece of text is in, as far as the guide needs to know: Romanian, English, a mix
 * of both, or too little to tell.
 */
export type DetectedLanguage = Locale | "mixed" | "unknown";

/**
 * Function words only one of the two languages uses. Words both share ("a", "are", "in", "am",
 * "an", "o", "me") are left out, so they never tip the balance.
 */
const ROMANIAN = new Set([
	"si",
	"sau",
	"este",
	"e",
	"sunt",
	"care",
	"pentru",
	"cu",
	"din",
	"la",
	"de",
	"pe",
	"ce",
	"cum",
	"nu",
	"un",
	"una",
	"unei",
	"unui",
	"mai",
	"sa",
	"se",
	"ca",
	"dar",
	"al",
	"ale",
	"lui",
	"ei",
	"acest",
	"aceasta",
	"acesta",
	"noi",
	"voi",
	"eu",
	"tu",
	"el",
	"ea",
	"avem",
	"aveti",
	"unde",
	"cand",
	"cat",
	"cate",
	"poate",
	"pot",
	"puteti",
	"daca",
	"despre",
	"meu",
	"mea",
	"tau",
	"ta",
	"nostru",
	"noastra",
	"va",
	"vreau",
	"ziua",
	"buna",
	"multumesc",
	"cine",
	"fiul",
	"fiica",
	"copilul",
	"oferiti",
	"exista",
	"arata",
	"decurge",
	"costa",
	"dureaza",
]);

const ENGLISH = new Set([
	"the",
	"and",
	"is",
	"of",
	"to",
	"for",
	"with",
	"what",
	"how",
	"does",
	"do",
	"my",
	"you",
	"your",
	"we",
	"our",
	"can",
	"this",
	"that",
	"it",
	"at",
	"on",
	"which",
	"who",
	"when",
	"where",
	"why",
	"be",
	"have",
	"has",
	"there",
	"will",
	"would",
	"should",
	"about",
	"from",
	"son",
	"daughter",
	"child",
	"hello",
	"thanks",
	"please",
	"offer",
	"take",
	"takes",
	"long",
]);

/**
 * Romanian letters with diacritics: a lower-case word that carries one is Romanian. A capitalised
 * one may be a proper noun ("Galați", "România", "Ștefan") that an English sentence names too, so
 * it counts only if it is also a Romanian function word.
 */
const DIACRITIC = /[ăâîșțşţ]/;
const CAPITALISED = /^\p{Lu}/u;

/** How many markers it takes before the guide names a language at all. */
const MIN_MARKERS = 2;

/** One language must outweigh the other this many times over to be named. */
const DOMINANCE = 2;

/**
 * Detects Romanian or English deterministically, from function words and Romanian diacritics, so
 * it works with diacritics stripped ("cum arata o evaluare") and costs nothing. Mastra's
 * `LanguageDetector` is a model call, and its answer could not change anything here: the answer
 * language is the site's configured locale whatever the visitor writes.
 */
export function detectLanguage(text: string): DetectedLanguage {
	let ro = 0;
	let en = 0;
	for (const raw of text.split(/[^\p{L}\p{M}'’-]+/u)) {
		if (raw.length === 0) continue;
		if (DIACRITIC.test(raw) && !CAPITALISED.test(raw)) {
			ro += 1;
			continue;
		}
		for (const word of fold(raw).trim().split(" ")) {
			if (ROMANIAN.has(word)) ro += 1;
			else if (ENGLISH.has(word)) en += 1;
		}
	}
	if (ro + en < MIN_MARKERS) return "unknown";
	if (ro >= DOMINANCE * en) return "ro";
	if (en >= DOMINANCE * ro) return "en";
	return "mixed";
}

/** True when the text is clearly in the other language than `locale` (mixed or short text is not). */
export function isOtherLanguage(text: string, locale: Locale): boolean {
	const detected = detectLanguage(text);
	return detected !== locale && (detected === "ro" || detected === "en");
}
