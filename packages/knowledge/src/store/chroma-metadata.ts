import { z } from "zod";
import { type ChunkMetadata, ChunkMetadataSchema } from "./metadata";

/**
 * Chroma drops `null` metadata values and MERGES metadata on upsert (a key left out keeps its
 * old value). A chunk's metadata is therefore stored as one JSON string, `record`, rewritten
 * whole on every write and parsed back with zod: `reviewedBy: null` stays null, and no stale
 * review stamp can survive. `entryId`, `brand` and `locale` are copied beside it as plain
 * strings, so deletes can filter by entry and the collection stays readable in Chroma's tools.
 */
export interface ChromaChunkMetadata {
	entryId: string;
	brand: string;
	locale: string;
	record: string;
}

/** The fields copied beside the record; a ChunkMetadata always has them. */
export interface ChromaRowIdentity {
	entryId: string;
	brand: string;
	locale: string;
}

export function encodeChromaMetadata(m: ChromaRowIdentity): ChromaChunkMetadata {
	return { entryId: m.entryId, brand: m.brand, locale: m.locale, record: JSON.stringify(m) };
}

const StoredSchema = z.object({
	entryId: z.string(),
	brand: z.string(),
	locale: z.string(),
	record: z.string(),
});

const JsonRecord = z.string().transform((s, ctx): unknown => {
	try {
		const value: unknown = JSON.parse(s);
		return value;
	} catch {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: "record is not JSON" });
		return z.NEVER;
	}
});

/**
 * The chunk a Chroma row holds, or null when it is not one of ours: no record, a record that is
 * not JSON or not a chunk, or copied fields that disagree with the record (a delete by entry id
 * must reach every row whose passage carries that id).
 */
export function decodeChromaMetadata(raw: unknown): ChunkMetadata | null {
	const stored = StoredSchema.safeParse(raw);
	if (!stored.success) return null;
	const json = JsonRecord.safeParse(stored.data.record);
	if (!json.success) return null;
	const m = ChunkMetadataSchema.safeParse(json.data);
	if (!m.success) return null;
	const s = stored.data;
	if (m.data.entryId !== s.entryId || m.data.brand !== s.brand || m.data.locale !== s.locale) {
		return null;
	}
	return m.data;
}
