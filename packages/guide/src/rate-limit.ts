import { z } from "zod";

/**
 * Counts questions per client, so one client cannot run up the model bill or flood the guide. The
 * app supplies it (backed by its own store in production, e.g. Redis) and passes a `clientId` with
 * each ask (`AskControl.clientId`: a hash of the session or the IP, never a name or an e-mail).
 * Without a `clientId` the guide does not limit.
 */
export interface RateLimiter {
	/** Counts one question for the client; false when the client is over its limit. */
	take(clientId: string): boolean | Promise<boolean>;
}

export interface MemoryRateLimitOptions {
	/** Questions allowed per client in one window. */
	limit?: number;
	/** The window, in milliseconds. */
	windowMs?: number;
	/** The clock; for tests. */
	now?: () => number;
}

export const DEFAULT_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

/** Above this many tracked clients, expired windows are swept before a new one is opened. */
const SWEEP_AT = 10_000;

const MemoryRateLimitOptionsSchema = z.object({
	limit: z.number().int().positive().max(10_000).optional(),
	windowMs: z.number().int().positive().max(86_400_000).optional(),
	now: z.custom<() => number>((value) => typeof value === "function").optional(),
});

interface Window {
	start: number;
	count: number;
}

/**
 * A fixed-window limiter held in this process's memory: for development and single-instance
 * deployments. It forgets everything on restart and is not shared between instances.
 */
export function createMemoryRateLimiter(options: MemoryRateLimitOptions = {}): RateLimiter {
	const opts = MemoryRateLimitOptionsSchema.parse(options);
	const limit = opts.limit ?? DEFAULT_RATE_LIMIT.limit;
	const windowMs = opts.windowMs ?? DEFAULT_RATE_LIMIT.windowMs;
	const now = opts.now ?? Date.now;
	const windows = new Map<string, Window>();

	const sweep = (at: number): void => {
		for (const [key, window] of windows) {
			if (at - window.start >= windowMs) windows.delete(key);
		}
	};

	return {
		take(clientId) {
			const at = now();
			const current = windows.get(clientId);
			if (current === undefined || at - current.start >= windowMs) {
				if (windows.size >= SWEEP_AT) sweep(at);
				windows.set(clientId, { start: at, count: 1 });
				return true;
			}
			current.count += 1;
			return current.count <= limit;
		},
	};
}

/** What a limiter answers, parsed: an app's limiter is a boundary like any other. */
export const RateDecisionSchema: z.ZodType<boolean> = z.boolean();
