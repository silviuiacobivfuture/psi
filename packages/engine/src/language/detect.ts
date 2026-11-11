import { fold } from "../text/normalize";
import type { LanguagePack } from "./pack";

/**
 * What language a piece of text is in, as far as the engine needs to know: one pack's locale, a
 * mix, or too little to tell.
 */
export type DetectedLanguage = string;

export const MIXED = "mixed";
export const UNKNOWN = "unknown";

const CAPITALISED = /^\p{Lu}/u;

/** How many markers it takes before a language is named at all. */
const MIN_MARKERS = 2;

/** The leading language must outweigh the runner-up this many times over to be named. */
const DOMINANCE = 2;

/** Detects languages among a fixed set of packs, deterministically and at no cost. */
export interface LanguageDetector {
	/** A pack's locale, `mixed` or `unknown`. */
	detect(text: string): DetectedLanguage;
	/** True when the text is clearly in another of the packs' languages than `locale`. */
	isOther(text: string, locale: string): boolean;
}

/**
 * Counts each pack's function words (on folded text, so stripped diacritics still count) and its
 * marked letters (a lower-case word carrying one; a capitalised one may be a proper noun another
 * language names too). The leading language is named when it has at least two markers and twice
 * the runner-up's. Mastra's `LanguageDetector` is a model call, and its answer could not change
 * anything: the answer language is the configured locale whatever the visitor writes.
 */
export function createLanguageDetector(packs: ReadonlyArray<LanguagePack>): LanguageDetector {
	const markers = packs.map((pack) => new Set(pack.markers));
	const detect = (text: string): DetectedLanguage => {
		const counts = packs.map(() => 0);
		const bump = (i: number): void => {
			counts[i] = (counts[i] ?? 0) + 1;
		};
		for (const raw of text.split(/[^\p{L}\p{M}'’-]+/u)) {
			if (raw.length === 0) continue;
			const marked = packs.findIndex(
				(pack) => pack.marked?.test(raw) === true && !CAPITALISED.test(raw),
			);
			if (marked >= 0) {
				bump(marked);
				continue;
			}
			for (const word of fold(raw).trim().split(" ")) {
				const i = markers.findIndex((set) => set.has(word));
				if (i >= 0) bump(i);
			}
		}
		const ranked = counts.map((count, i) => ({ count, i })).sort((a, b) => b.count - a.count);
		const first = ranked[0];
		const second = ranked[1]?.count ?? 0;
		const total = counts.reduce((sum, count) => sum + count, 0);
		if (first === undefined || total < MIN_MARKERS) return UNKNOWN;
		if (first.count >= DOMINANCE * second) return packs[first.i]?.locale ?? UNKNOWN;
		return MIXED;
	};
	return {
		detect,
		isOther(text, locale) {
			const detected = detect(text);
			return detected !== locale && detected !== MIXED && detected !== UNKNOWN;
		},
	};
}
