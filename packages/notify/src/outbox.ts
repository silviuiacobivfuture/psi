import type { TriggerBody } from "./novu-http";

/** One trigger waiting to be delivered to Novu. */
export interface Job {
	readonly id: string;
	readonly idempotencyKey: string;
	readonly body: TriggerBody;
	/** Safe-to-log context: never a recipient, an address or a payload. */
	readonly app: string;
	readonly event: string;
	attempts: number;
	/** How many times Novu answered from a kept refusal: the key walks to `<key>:r<n>`. */
	replays: number;
	dueAt: number;
}

/**
 * Where triggers wait. The default is in memory (lost on a restart; the idempotency key makes a
 * re-enqueue after a restart safe). A durable store (the service's database) implements this port.
 */
export interface Outbox {
	add(job: Job): Promise<void>;
	/** Jobs due at `now`, oldest first, at most `limit`. */
	due(now: number, limit: number): Promise<ReadonlyArray<Job>>;
	reschedule(id: string, attempts: number, dueAt: number, replays: number): Promise<void>;
	remove(id: string): Promise<void>;
	size(): Promise<number>;
}

export function createMemoryOutbox(): Outbox {
	const jobs = new Map<string, Job>();
	return {
		add(job) {
			if (!jobs.has(job.id)) jobs.set(job.id, job);
			return Promise.resolve();
		},
		due(now, limit) {
			return Promise.resolve(
				[...jobs.values()]
					.filter((j) => j.dueAt <= now)
					.sort((a, b) => a.dueAt - b.dueAt)
					.slice(0, limit),
			);
		},
		reschedule(id, attempts, dueAt, replays) {
			const job = jobs.get(id);
			if (job) {
				job.attempts = attempts;
				job.replays = replays;
				job.dueAt = dueAt;
			}
			return Promise.resolve();
		},
		remove(id) {
			jobs.delete(id);
			return Promise.resolve();
		},
		size() {
			return Promise.resolve(jobs.size);
		},
	};
}
