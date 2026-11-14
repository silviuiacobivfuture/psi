export interface RateLimit {
	/** The bucket's size: how many calls may arrive at once. */
	capacity: number;
	refillPerSecond: number;
}

export interface Limiter {
	/** Takes one token from the bucket of `key`; `retryAfterSeconds` says when the next one is there. */
	take(key: string): { ok: true } | { ok: false; retryAfterSeconds: number };
}

const MAX_BUCKETS = 20_000;

/**
 * A token bucket per key, in memory. Per replica: with two replicas a caller may get twice the rate, which is the price
 * of needing no shared state; the limit exists to stop a runaway site or a scripted visitor, not to meter.
 */
export function createLimiter(limit: RateLimit, clock: () => number): Limiter {
	const buckets = new Map<string, { tokens: number; at: number }>();
	return {
		take(key) {
			const now = clock();
			const held = buckets.get(key) ?? { tokens: limit.capacity, at: now };
			const tokens = Math.min(
				limit.capacity,
				// A clock that stepped back (NTP, a test) refills nothing; it must never drain the bucket for hours.
				held.tokens + (Math.max(0, now - held.at) / 1000) * limit.refillPerSecond,
			);
			buckets.delete(key);
			if (tokens < 1) {
				buckets.set(key, { tokens, at: now });
				return {
					ok: false,
					retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / limit.refillPerSecond)),
				};
			}
			buckets.set(key, { tokens: tokens - 1, at: now });
			// Map keeps insertion order: when full, the least recently used bucket goes first.
			if (buckets.size > MAX_BUCKETS) {
				const oldest = buckets.keys().next().value;
				if (oldest !== undefined) buckets.delete(oldest);
			}
			return { ok: true };
		},
	};
}
