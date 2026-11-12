/** Whitespace and anchors, shared by every extractor. */

/** Control, soft-hyphen and zero-width characters: never text the guide should read. */
function invisible(code: number): boolean {
	return (
		(code <= 0x1f && code !== 0x0a && code !== 0x0d && code !== 0x09) ||
		code === 0x7f ||
		code === 0xad ||
		(code >= 0x200b && code <= 0x200d) ||
		code === 0xfeff
	);
}

const dropInvisible = (text: string): string =>
	Array.from(text)
		.filter((ch) => !invisible(ch.codePointAt(0) ?? 0))
		.join("");

/**
 * NFC, no control or zero-width characters, tabs and runs of spaces collapsed, trailing spaces
 * dropped, at most one blank line between paragraphs.
 */
export function normalizeText(text: string): string {
	return dropInvisible(text.normalize("NFC").replace(/\r\n?/g, "\n"))
		.replace(/[\t  ]+/g, " ")
		.split("\n")
		.map((l) => l.trimEnd())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** A heading's anchor: lowercase, diacritics folded, [a-z0-9-] only, ≤ 60 characters. */
export function slug(text: string): string {
	const s = text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
	return s === "" ? "section" : s;
}

/** Unique anchors in document order: a repeated heading gets `-2`, `-3`. */
export function uniqueAnchors(anchors: ReadonlyArray<string>): string[] {
	const seen = new Map<string, number>();
	return anchors.map((a) => {
		const n = (seen.get(a) ?? 0) + 1;
		seen.set(a, n);
		return n === 1 ? a : `${a}-${n}`;
	});
}
