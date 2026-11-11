import { z } from "zod";

export type EmbedderKind = "openrouter" | "lexical";

/**
 * Turns many strings into vectors. Every vector from one embedder has the same dimension.
 * `space` names the vector space ([a-z0-9_], ≤ 24 chars): vectors from different spaces are never
 * compared, because each space gets its own indexes.
 */
export interface Embedder {
	readonly kind: EmbedderKind;
	readonly model: string;
	readonly space: string;
	embed(texts: ReadonlyArray<string>): Promise<number[][]>;
}

/** What an ingest reports about the embedder it used. */
export interface EmbedderInfo {
	kind: EmbedderKind;
	model: string;
	space: string;
}

export function describeEmbedder(e: Embedder): EmbedderInfo {
	return { kind: e.kind, model: e.model, space: e.space };
}

export const SPACE_PATTERN = /^[a-z0-9_]{1,24}$/;

const Vectors = z.array(z.array(z.number().finite()).min(1));

/** Parses an embedder's output: one finite vector per input, all of one dimension. */
export function parseVectors(raw: unknown, expected: number): number[][] {
	const vectors = Vectors.parse(raw);
	if (vectors.length !== expected) {
		throw new Error(`embedder returned ${vectors.length} vectors for ${expected} inputs`);
	}
	const first = vectors[0];
	if (first !== undefined && vectors.some((v) => v.length !== first.length)) {
		throw new Error("embedder returned vectors of different dimensions");
	}
	return vectors;
}
