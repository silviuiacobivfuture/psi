import { chromaStore } from "./chroma";
import type { ParsedVectorConfig } from "./config";
import { libsqlStore } from "./libsql";
import type { VectorStore } from "./types";

/** Opens the store a resolved config names. */
export function openVectorStore(config: ParsedVectorConfig): VectorStore {
	switch (config.kind) {
		case "libsql":
			return libsqlStore(config);
		case "chroma":
			return chromaStore(config);
	}
}
