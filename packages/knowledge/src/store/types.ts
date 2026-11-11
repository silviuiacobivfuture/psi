import type { MastraVector } from "@mastra/core/vector";
import type { ChunkMetadata } from "./metadata";

export type VectorStoreKind = "libsql" | "chroma";

/** Which store holds the vectors, and where. Never carries a token or an API key. */
export interface VectorStoreInfo {
	kind: VectorStoreKind;
	/** LibSQL: the database URL without its query string. Chroma: `<origin>/<tenant>/<database>`. */
	location: string;
}

/** One row a vector query returned: its metadata (still to be parsed) and its cosine score. */
export interface StoredRow {
	metadata: unknown;
	score: number;
}

/** The chunks of one index written in one call: ids, vectors and metadata are parallel. */
export interface ChunkRows {
	ids: ReadonlyArray<string>;
	vectors: ReadonlyArray<ReadonlyArray<number>>;
	metadata: ReadonlyArray<ChunkMetadata>;
}

/**
 * The narrow port `createKnowledge` drives: the few Mastra vector operations it needs, adapted
 * to one store (LibSQL or Chroma). Store-specific rules (index names, metadata encoding, score
 * floor) live behind it, so the knowledge logic is the same on both.
 */
export interface VectorStore {
	readonly info: VectorStoreInfo;
	/** Mastra's own vector store underneath, for registering with a Mastra instance. */
	readonly vector: MastraVector;
	/** Every index this package owns (`kb_…`); nothing else in a shared store is listed. */
	ownIndexes(): Promise<ReadonlyArray<string>>;
	/** Throws when the store cannot hold an index of this name. */
	checkIndexName(name: string): void;
	/** The vector dimension an existing index was created with. */
	dimension(index: string): Promise<number>;
	createIndex(index: string, dimension: number): Promise<void>;
	upsert(index: string, rows: ChunkRows): Promise<void>;
	/** Deletes every chunk of these entries from one index. */
	deleteEntries(index: string, entryIds: ReadonlyArray<string>): Promise<void>;
	/** The nearest rows scoring above 0, best first. */
	query(
		index: string,
		vector: ReadonlyArray<number>,
		topK: number,
	): Promise<ReadonlyArray<StoredRow>>;
	close(): Promise<void>;
}
