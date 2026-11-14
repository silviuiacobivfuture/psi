import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";

/** Where one request spends its time: the stages its `Server-Timing` header names. */
export type Stage = "auth" | "fga" | "convex" | "handler";

const STAGES: readonly Stage[] = ["auth", "fga", "convex", "handler"];

interface Span {
	stage: Stage;
	start: number;
	end: number;
}

const scope = new AsyncLocalStorage<Span[]>();

/**
 * Runs `work` and, inside a request, notes how long it took under `stage`. Outside a request (a job, a test of an
 * adapter) it only runs: nothing is kept.
 */
export async function timed<T>(stage: Stage, work: () => Promise<T>): Promise<T> {
	const spans = scope.getStore();
	if (spans === undefined) return work();
	const start = performance.now();
	try {
		return await work();
	} finally {
		spans.push({ stage, start, end: performance.now() });
	}
}

/** The time some span of the stage was running (overlapping spans counted once): what the caller waited. */
function wall(spans: readonly Span[]): number {
	let total = 0;
	let open = Number.NEGATIVE_INFINITY;
	let close = Number.NEGATIVE_INFINITY;
	for (const s of [...spans].sort((a, b) => a.start - b.start)) {
		if (s.start > close) {
			if (close > open) total += close - open;
			open = s.start;
			close = s.end;
		} else close = Math.max(close, s.end);
	}
	return close > open ? total + (close - open) : total;
}

/** `Server-Timing` entries for these spans: per stage the time waited, and how many calls it took in all. */
export function timingHeader(spans: readonly Span[], totalMs: number): string {
	const parts: string[] = [];
	for (const stage of STAGES) {
		const of = spans.filter((s) => s.stage === stage);
		if (of.length === 0) continue;
		const sum = of.reduce((n, s) => n + (s.end - s.start), 0);
		parts.push(`${stage};dur=${wall(of).toFixed(1)};desc="${of.length}x ${sum.toFixed(1)}ms"`);
	}
	parts.push(`total;dur=${totalMs.toFixed(1)}`);
	return parts.join(", ");
}

/**
 * Every answer says where its time went (`Server-Timing`: sign-in check, OpenFGA, Convex, the handler, the total), so a
 * slow page can be read from the console's own header instead of guessed. Durations only: no values, no names.
 */
export function serverTiming(): MiddlewareHandler {
	return async (c, next) => {
		const spans: Span[] = [];
		const start = performance.now();
		await scope.run(spans, () => next());
		c.res.headers.set("server-timing", timingHeader(spans, performance.now() - start));
	};
}
