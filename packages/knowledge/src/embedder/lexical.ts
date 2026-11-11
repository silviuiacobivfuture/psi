import { fnv1a } from "../hash";
import type { Embedder } from "./types";

/**
 * DEVELOPMENT FALLBACK — a deterministic, dependency-free lexical embedder.
 *
 * Each text becomes a bag of features — whole words plus character trigrams of each word (so
 * "telefonul" still overlaps "telefon") — hashed (FNV-1a, signed) into a fixed number of
 * dimensions, weighted with sublinear term frequency, then L2-normalised. Cosine similarity of two
 * such vectors is a fuzzy word-overlap score.
 *
 * Honest limits: no semantics (synonyms and paraphrases do not match: "phone" never finds
 * "telefon"), no IDF (the corpus is not consulted, so frequent words weigh as much as rare ones
 * beyond a small stop-word list), and hash collisions add a little noise. It exists so development
 * and tests run without a key; production uses a real embedding model.
 */

export const LEXICAL_DIMENSION = 1024;
const WORD_WEIGHT = 1;
const TRIGRAM_WEIGHT = 0.35;

/** Function words dropped before hashing (ro with diacritics folded, then en). */
const STOP_WORDS: ReadonlySet<string> = new Set(
	[
		"a ai al ale am ar are as au ca cand care ce cel cea cei cele cu de din dintre e ea el este fi fie i ii il in la le lor lui mai ne nu o pe pentru prin sa se si sau sunt te tu un una unei unui va vor",
		"an and are as at be by do does for from has have how is it its of on or that the this to was what when which who will with you your we our us can i me my",
	]
		.join(" ")
		.split(" "),
);

/** Lower-cases, folds diacritics (ș, ş, ţ, ț, ă, î, â …) and splits on anything not a letter/digit. */
export function lexicalTokens(text: string): ReadonlyArray<string> {
	const folded = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
	return folded.split(/[^\p{L}\p{N}]+/u).filter((t) => t !== "" && !STOP_WORDS.has(t));
}

function features(token: string): ReadonlyArray<readonly [string, number]> {
	const out: Array<readonly [string, number]> = [[`w:${token}`, WORD_WEIGHT]];
	const padded = `^${token}$`;
	const chars = Array.from(padded);
	for (let i = 0; i + 3 <= chars.length; i++) {
		out.push([`g:${chars.slice(i, i + 3).join("")}`, TRIGRAM_WEIGHT]);
	}
	return out;
}

/** Embeds one text. All-zero when the text has no usable tokens. */
export function lexicalVector(text: string, dimension: number = LEXICAL_DIMENSION): number[] {
	const counts = new Map<string, number>();
	const weights = new Map<string, number>();
	for (const token of lexicalTokens(text)) {
		for (const [feature, weight] of features(token)) {
			counts.set(feature, (counts.get(feature) ?? 0) + 1);
			weights.set(feature, weight);
		}
	}
	const v = new Array<number>(dimension).fill(0);
	for (const [feature, count] of counts) {
		const h = fnv1a(feature);
		const slot = h % dimension;
		const sign = (h & 0x80000000) === 0 ? 1 : -1;
		const tf = 1 + Math.log(count);
		v[slot] = (v[slot] ?? 0) + sign * tf * (weights.get(feature) ?? 0);
	}
	const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
	return norm === 0 ? v : v.map((x) => x / norm);
}

export function createLexicalEmbedder(dimension: number = LEXICAL_DIMENSION): Embedder {
	if (!Number.isInteger(dimension) || dimension < 16 || dimension > 8192) {
		throw new Error("lexical embedder dimension must be an integer in 16..8192");
	}
	return {
		kind: "lexical",
		model: `lexical-hash-v1-${dimension}`,
		space: `lex1_${dimension}`,
		embed: async (texts) => texts.map((t) => lexicalVector(t, dimension)),
	};
}
