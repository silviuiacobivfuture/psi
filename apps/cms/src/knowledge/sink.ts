import type { KnowledgeEntryInput, KnowledgeStore } from "@psi/knowledge";
import { env } from "../env";

/**
 * Where published knowledge goes: the guide's store (@psi/knowledge), opened lazily on the
 * first publish. With PSI_KNOWLEDGE_DB_URL unset, publishing still works and the CMS says, once,
 * that it is not indexing.
 */
export interface KnowledgeSink {
	ingest(entries: ReadonlyArray<KnowledgeEntryInput>): Promise<void>;
	remove(ids: ReadonlyArray<string>): Promise<void>;
}

let store: Promise<KnowledgeStore> | undefined;

async function open(url: string): Promise<KnowledgeStore> {
	const { createKnowledge } = await import("@psi/knowledge");
	return createKnowledge({ url });
}

export function knowledgeSink(): KnowledgeSink | null {
	const url = env().PSI_KNOWLEDGE_DB_URL;
	if (url === undefined) return null;
	store ??= open(url);
	const s = store;
	return {
		async ingest(entries) {
			if (entries.length > 0) await (await s).ingest(entries);
		},
		async remove(ids) {
			if (ids.length > 0) await (await s).remove(ids);
		},
	};
}
