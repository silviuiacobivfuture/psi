/**
 * Folds text for matching: lower case, diacritics removed (ă â î ș ț and the cedilla forms ş ţ all
 * decompose under NFD), hyphens and apostrophes turned into spaces ("să-mi" → "sa mi",
 * "don't" → "don t"), runs of whitespace collapsed. Patterns are written against this form.
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
