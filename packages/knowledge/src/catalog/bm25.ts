import { lexicalTokens } from "../embedder/lexical";

/**
 * Okapi BM25 over the catalog's chunks: the lexical tier, used when embeddings are down or
 * switched off, and fused with the semantic tier in deep search. Tokens are folded (case,
 * diacritics), stop words dropped, and stemmed lightly: Romanian and English inflections end on
 * the same stem ("programare", "programarea", "programări" → "progr"; "booking", "booked" →
 * "booki"/"booke" share "book" through the prefix).
 */
const K1 = 1.2;
const B = 0.75;
/** Stems keep this many leading characters: long enough to tell words apart, short enough to meet inflections. */
const STEM_LENGTH = 5;

const SUFFIXES = [
	// Romanian definite articles and plurals (folded), longest first.
	"urilor",
	"ilor",
	"elor",
	"ului",
	"ele",
	"ile",
	"uri",
	"ul",
	"ea",
	"le",
	// English.
	"ing",
	"ed",
	"es",
	"ly",
	"s",
];

/** Strips one common suffix when enough is left; undefined when none applies. */
function strip(t: string): string | undefined {
	const suffix = SUFFIXES.find((s) => t.length - s.length >= 4 && t.endsWith(s));
	return suffix === undefined ? undefined : t.slice(0, -suffix.length);
}

/** A token's light stem: up to two common suffixes removed ("bookings" → "book"), then a prefix. */
export function stem(token: string): string {
	const once = strip(token) ?? token;
	return (strip(once) ?? once).slice(0, STEM_LENGTH);
}

/** The text's stems, in order. */
export function stems(text: string): ReadonlyArray<string> {
	return lexicalTokens(text)
		.filter((t) => t.length >= 2)
		.map(stem);
}

interface Doc<T> {
	value: T;
	length: number;
	terms: ReadonlyMap<string, number>;
}

export interface Bm25<T> {
	/** The documents best matching the query, with their BM25 scores (best first, all > 0). */
	search(query: string, topK: number): ReadonlyArray<{ value: T; score: number }>;
	readonly size: number;
}

/** Builds a BM25 index over documents (their text) carrying values. */
export function createBm25<T>(docs: ReadonlyArray<{ text: string; value: T }>): Bm25<T> {
	const indexed: Array<Doc<T>> = docs.map((d) => {
		const terms = new Map<string, number>();
		const all = stems(d.text);
		for (const t of all) terms.set(t, (terms.get(t) ?? 0) + 1);
		return { value: d.value, length: all.length, terms };
	});
	const df = new Map<string, number>();
	for (const d of indexed) for (const t of d.terms.keys()) df.set(t, (df.get(t) ?? 0) + 1);
	const n = indexed.length;
	const avg = n === 0 ? 0 : indexed.reduce((sum, d) => sum + d.length, 0) / n;
	const idf = (t: string): number => {
		const f = df.get(t) ?? 0;
		return Math.log(1 + (n - f + 0.5) / (f + 0.5));
	};
	return {
		size: n,
		search(query, topK) {
			const q = [...new Set(stems(query))];
			if (q.length === 0 || n === 0) return [];
			const scored: Array<{ value: T; score: number }> = [];
			for (const d of indexed) {
				let score = 0;
				for (const t of q) {
					const tf = d.terms.get(t);
					if (tf === undefined) continue;
					score += (idf(t) * (tf * (K1 + 1))) / (tf + K1 * (1 - B + (B * d.length) / (avg || 1)));
				}
				if (score > 0) scored.push({ value: d.value, score });
			}
			return scored.sort((a, b) => b.score - a.score).slice(0, topK);
		},
	};
}
