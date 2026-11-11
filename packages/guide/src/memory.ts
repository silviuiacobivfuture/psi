import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

/** How many earlier messages of a thread the guide reads back. */
export const THREAD_WINDOW = 10;

/** The directory a `file:` LibSQL URL writes into, or undefined for remote URLs and `:memory:`. */
export function fileDirectory(url: string): string | undefined {
	if (!url.startsWith("file:")) return undefined;
	const path = url.startsWith("file://") ? fileURLToPath(url) : url.slice("file:".length);
	if (path.length === 0 || path === ":memory:") return undefined;
	return dirname(resolve(path));
}

/**
 * Conversation memory on LibSQL. Only recent messages are recalled: no semantic recall, no working
 * memory and no title generation (each would store more or call the model again).
 */
export function openMemory(url: string): Memory {
	const directory = fileDirectory(url);
	if (directory !== undefined) mkdirSync(directory, { recursive: true });
	return new Memory({
		storage: new LibSQLStore({ id: "psi-guide-memory", url }),
		options: {
			lastMessages: THREAD_WINDOW,
			semanticRecall: false,
			workingMemory: { enabled: false },
			generateTitle: false,
		},
	});
}
