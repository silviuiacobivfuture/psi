import { createHash, randomBytes } from "node:crypto";
import { type Counter, type CounterKey, counterId } from "@psi/cms-client";
import type { CounterSink } from "./sinks";

/**
 * The blog's server-side collector: it turns allowed hits into daily counters in memory and
 * flushes them to a sink. What it keeps about a visitor: nothing. To count a reader once per
 * article per day (not every reload) it remembers, for the current UTC day only, a sha256 of
 * (a random salt + address + browser + what was counted); the salt is made at random each day,
 * lives only in this process's memory and is dropped at midnight with every hash, so no hash can
 * be linked across days or to an address. Neither the hash nor its inputs leave the process.
 */
export interface Collector {
	/** Counts once per reader per day for `key` (dedupe on `who`, never stored). */
	hit(key: Omit<CounterKey, "day">, who: string): void;
	/** Counts every time (the guide's questions: no reader identity at all). */
	count(key: Omit<CounterKey, "day">): void;
	/** Hands the pending counters to the sink; on failure keeps them for the next flush. */
	flush(): Promise<void>;
	/** Pending counters (tests, health). */
	pending(): ReadonlyArray<Counter>;
}

export interface CollectorOptions {
	sink: CounterSink;
	now?: () => Date;
	/** Per day, how many distinct readers' hashes are remembered before deduping stops (memory bound). */
	maxSeen?: number;
	/** Pending counters kept across failed flushes, at most. */
	maxPending?: number;
}

export function createCollector(o: CollectorOptions): Collector {
	const now = o.now ?? (() => new Date());
	const maxSeen = o.maxSeen ?? 200_000;
	const maxPending = o.maxPending ?? 5000;
	let day = "";
	let salt = randomBytes(32);
	let seen = new Set<string>();
	let counters = new Map<string, Counter>();

	function today(): string {
		const d = now().toISOString().slice(0, 10);
		if (d !== day) {
			day = d;
			salt = randomBytes(32);
			seen = new Set();
		}
		return d;
	}

	function add(key: Omit<CounterKey, "day">, d: string): void {
		const full: CounterKey = { ...key, day: d };
		const id = counterId(full);
		const c = counters.get(id);
		if (c !== undefined) c.count += 1;
		else if (counters.size < maxPending) counters.set(id, { ...full, count: 1 });
	}

	return {
		hit(key, who) {
			const d = today();
			const h = createHash("sha256")
				.update(salt)
				.update(`${who}|${key.brand}|${key.slug}|${key.locale}|${key.metric}`)
				.digest("base64url");
			if (seen.has(h)) return;
			if (seen.size < maxSeen) seen.add(h);
			add(key, d);
		},
		count(key) {
			add(key, today());
		},
		async flush() {
			if (counters.size === 0) return;
			const batch = [...counters.values()];
			counters = new Map();
			try {
				await o.sink.write(batch);
			} catch (err) {
				console.error(`analytics: flush to ${o.sink.kind} failed (${String(err)})`);
				for (const c of batch) {
					const id = counterId(c);
					const cur = counters.get(id);
					if (cur !== undefined) cur.count += c.count;
					else if (counters.size < maxPending) counters.set(id, c);
				}
			}
		},
		pending: () => [...counters.values()],
	};
}
