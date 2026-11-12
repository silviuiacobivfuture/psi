import type { Brand } from "../contract";
import { type KnowledgeEntry, retrievability } from "../entry";
import { type ChunkMetadata, ChunkMetadataSchema } from "./metadata";

/** One entry as the store holds it: rebuilt from its chunks' metadata, chunks in order. */
export interface StoredEntry {
	entry: KnowledgeEntry;
	chunks: ReadonlyArray<string>;
}

/**
 * Rebuilds the retrievable entries of one brand from stored rows (any index, any embedder
 * space). The same checks as a search applies on the way out: a row that does not parse, belongs
 * to another brand, or that the retrievability rule refuses is left out. When an entry sits in
 * two spaces (it never should: ingest removes the other copy), the first row of each chunk wins.
 */
export function collectStored(rows: ReadonlyArray<unknown>, brand: Brand): StoredEntry[] {
	const byEntry = new Map<string, { first: ChunkMetadata; chunks: Map<number, string> }>();
	for (const raw of rows) {
		const parsed = ChunkMetadataSchema.safeParse(raw);
		if (!parsed.success) continue;
		const m = parsed.data;
		if (m.brand !== brand || !retrievability(m).retrievable) continue;
		const held = byEntry.get(m.entryId) ?? { first: m, chunks: new Map<number, string>() };
		if (!held.chunks.has(m.chunk)) held.chunks.set(m.chunk, m.text);
		byEntry.set(m.entryId, held);
	}
	const out: StoredEntry[] = [];
	for (const { first: m, chunks } of byEntry.values()) {
		const ordered = [...chunks.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
		out.push({
			entry: {
				id: m.entryId,
				brand: m.brand,
				locale: m.locale,
				kind: m.kind,
				title: m.title,
				url: m.url,
				body: ordered.join("\n\n"),
				status: m.status,
				reviewedBy: m.reviewedBy,
				reviewedAt: m.reviewedAt,
				...(m.audience === undefined ? {} : { audience: m.audience }),
				...(m.hub === undefined ? {} : { hub: m.hub }),
				...(m.method === undefined ? {} : { method: m.method }),
			},
			chunks: ordered,
		});
	}
	return out.sort((a, b) => a.entry.id.localeCompare(b.entry.id));
}
