/**
 * Folds text for matching: lower case, diacritics removed (every combining mark goes under NFD,
 * so ă â î ș ț and the cedilla forms ş ţ fold to their base letters), hyphens and apostrophes
 * turned into spaces ("să-mi" → "sa mi", "don't" → "don t"), runs of whitespace collapsed, and
 * one space added at each end so a pattern can anchor on a word with `\b` or a leading space.
 * Every rule set, language pack and profile pattern is written against this form.
 */
export function fold(text: string): string {
	return ` ${text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[-‐‑–—'’`´]/g, " ")
		.replace(/\s+/g, " ")
		.trim()} `;
}

/** True when any pattern matches the folded text. */
export function matchesAny(folded: string, patterns: ReadonlyArray<RegExp>): boolean {
	return patterns.some((pattern) => pattern.test(folded));
}
