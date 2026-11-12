import { z } from "zod";
import { BrandSchema, LocaleSchema, type Passage } from "../contract";
import { KindSchema, type KnowledgeEntry, retrievability, StatusSchema } from "../entry";

/** What each stored chunk carries: the Source fields, the review state and the chunk's text. */
export const ChunkMetadataSchema = z.object({
	entryId: z.string().min(1),
	brand: BrandSchema,
	locale: LocaleSchema,
	kind: KindSchema,
	status: StatusSchema,
	title: z.string().min(1),
	url: z.string().min(1),
	reviewedBy: z.string().nullable(),
	reviewedAt: z.string().nullable(),
	chunk: z.number().int().min(0),
	text: z.string().min(1),
	/** Optional, for the catalog's topics when it is rebuilt from the store (older rows lack them). */
	audience: z.string().optional(),
	hub: z.string().optional(),
	method: z.string().optional(),
});

export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;

export function chunkMetadata(entry: KnowledgeEntry, chunk: number, text: string): ChunkMetadata {
	return {
		entryId: entry.id,
		brand: entry.brand,
		locale: entry.locale,
		kind: entry.kind,
		status: entry.status,
		title: entry.title,
		url: entry.url,
		reviewedBy: entry.reviewedBy,
		reviewedAt: entry.reviewedAt,
		chunk,
		text,
		...(entry.audience === undefined ? {} : { audience: entry.audience }),
		...(entry.hub === undefined ? {} : { hub: entry.hub }),
		...(entry.method === undefined ? {} : { method: entry.method }),
	};
}

/** The stored vector id of one chunk. */
export function chunkId(entryId: string, chunk: number): string {
	return `${entryId}#${chunk}`;
}

/**
 * Turns a stored row into a Passage, or null when it must not be shown: unparseable metadata,
 * a brand or locale other than the query's, or anything the retrievability rule refuses. The
 * index already guarantees all three; this re-asserts them on the way out.
 */
export function toPassage(
	raw: unknown,
	score: number,
	expect: { brand: string; locale: string },
): Passage | null {
	const parsed = ChunkMetadataSchema.safeParse(raw);
	if (!parsed.success) return null;
	const m = parsed.data;
	if (m.brand !== expect.brand || m.locale !== expect.locale) return null;
	if (!retrievability(m).retrievable) return null;
	return {
		source: {
			id: m.entryId,
			title: m.title,
			url: m.url,
			reviewedBy: m.reviewedBy,
			reviewedAt: m.reviewedAt,
		},
		text: m.text,
		score,
	};
}
