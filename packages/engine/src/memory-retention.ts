import type { Memory } from "@mastra/memory";
import { z } from "zod";
import type { ThreadKey } from "./memory";

/** The thread metadata key the organisation's retention is stamped under. */
export const RETENTION_KEY = "retentionDays";
const DAY_MS = 86_400_000;

const Stamp = z.object({ [RETENTION_KEY]: z.number().int().min(0).max(365) }).passthrough();

/** The retention a thread carries, or undefined when it was never stamped (or the stamp cannot be read). */
export function retentionOf(metadata: unknown): number | undefined {
	const parsed = Stamp.safeParse(metadata);
	return parsed.success ? parsed.data[RETENTION_KEY] : undefined;
}

/**
 * Stamps the organisation's retention (`memory.retentionDays`) on a conversation, so the sweep keeps each thread exactly
 * as long as its organisation says, whichever organisation's turn wrote it last. A thread that does not exist yet is
 * left alone (it is stamped after its first turn).
 */
export async function stampRetention(memory: Memory, key: ThreadKey, days: number): Promise<void> {
	const thread = await memory.getThreadById({ threadId: key.threadId });
	if (thread === null || thread.resourceId !== key.resourceId) return;
	if (retentionOf(thread.metadata) === days) return;
	await memory.updateThread({
		id: thread.id,
		title: thread.title ?? "",
		metadata: { ...(thread.metadata ?? {}), [RETENTION_KEY]: days },
	});
}

/**
 * Deletes every message older than its thread's retention (`fallbackDays` for a thread never stamped); returns how many
 * went. A thread left with no message is deleted too.
 */
export async function sweepByRetention(
	memory: Memory,
	fallbackDays: number,
	now: number,
): Promise<number> {
	const { threads } = await memory.listThreads({ perPage: false });
	let deleted = 0;
	for (const thread of threads) {
		const days = retentionOf(thread.metadata) ?? fallbackDays;
		const cutoff = now - days * DAY_MS;
		const { messages } = await memory.recall({
			threadId: thread.id,
			resourceId: thread.resourceId,
			perPage: false,
		});
		const old = messages.filter((m) => new Date(m.createdAt).getTime() <= cutoff).map((m) => m.id);
		if (old.length > 0) {
			await memory.deleteMessages(old);
			deleted += old.length;
		}
		if (old.length === messages.length && new Date(thread.updatedAt).getTime() <= cutoff) {
			await memory.deleteThread(thread.id);
		}
	}
	return deleted;
}
