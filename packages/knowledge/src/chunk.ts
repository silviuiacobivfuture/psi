import { MDocument } from "@mastra/rag";

/** Target chunk size and overlap, in approximate tokens. */
export const CHUNK_MAX_TOKENS = 450;
export const CHUNK_OVERLAP_TOKENS = 60;

/**
 * Approximate token count: ~4 characters per token (code points, so diacritics and emoji count
 * once). js-tiktoken is not a direct dependency, so this is an estimate, not a tokenizer.
 */
export function approxTokens(text: string): number {
	return Math.ceil(Array.from(text).length / 4);
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Splits a markdown body into retrieval chunks with Mastra's markdown-aware splitter
 * (headings, then paragraphs, lines, words; ~450 tokens with ~60 tokens of overlap).
 * The body is NFC-normalised first (so ș typed as s + combining comma equals ș), blank chunks
 * are dropped, and a character split never leaves half of a surrogate pair behind.
 */
export async function chunkMarkdown(body: string): Promise<ReadonlyArray<string>> {
	const text = body.normalize("NFC");
	if (text.trim() === "") return [];
	const doc = MDocument.fromMarkdown(text);
	const chunks = await doc.chunk({
		strategy: "markdown",
		maxSize: CHUNK_MAX_TOKENS,
		overlap: CHUNK_OVERLAP_TOKENS,
		lengthFunction: approxTokens,
	});
	return chunks.map((c) => c.text.replace(LONE_SURROGATE, "").trim()).filter((t) => t !== "");
}
