import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { within } from "./deadline";

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

/** How long to wait for a refused run to settle before removing its answer from the thread. */
const FORGET_AFTER_MS = 5_000;

/** Where a consented thread lives in memory. */
export interface ThreadKey {
	threadId: string;
	resourceId: string;
}

/**
 * Removes the answers of a run that did not reach the visitor complete (refused, failed or
 * abandoned) from the thread, so they never replay into the next prompt. The visitor's question
 * stays. It runs in the background once the run has settled, because Mastra saves the answer when
 * the run ends, and an aborted run saves it under a new message id: every guide message written
 * since the run started is removed.
 */
export async function forgetAnswer(
	memory: Memory,
	key: ThreadKey,
	since: number,
	settled: Promise<unknown>,
): Promise<void> {
	try {
		await within(settled, FORGET_AFTER_MS, "run settle").catch(() => undefined);
		const { messages } = await memory.recall({ ...key, perPage: false });
		const written = messages
			.filter((m) => m.role === "assistant" && new Date(m.createdAt).getTime() >= since)
			.map((m) => m.id);
		if (written.length > 0) await memory.deleteMessages(written);
	} catch {
		// Nothing more can be done here; the next answer is still checked on its own.
	}
}
