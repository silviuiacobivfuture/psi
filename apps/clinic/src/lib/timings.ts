import type { Context, MiddlewareHandler } from "hono";

/**
 * Where one page's time goes: the session lookup, the calls to the scheduling service (and, folded from each answer's
 * own `Server-Timing`, the service's OpenFGA and Convex time), the rest being this console's own work.
 */
export type Stage = "session" | "api" | "caps";

const STAGES: readonly Stage[] = ["session", "api", "caps"];
/** The service's stages a console page reports, summed over its calls (they overlap: a sum, not the time waited). */
const SERVICE: readonly string[] = ["auth", "fga", "convex", "handler"];

interface Span {
	stage: Stage;
	start: number;
	end: number;
}

interface Held {
	spans: Span[];
	/** The service's own stages over every call of this request, summed. */
	service: Map<string, number>;
}

const seen = new WeakMap<Request, Held>();

function heldFor(request: Request): Held {
	const found = seen.get(request);
	if (found !== undefined) return found;
	const made: Held = { spans: [], service: new Map() };
	seen.set(request, made);
	return made;
}

/** Runs `work` and notes, for the page the request answers, how long it took under `stage`. */
export async function timed<T>(request: Request, stage: Stage, work: () => Promise<T>): Promise<T> {
	const start = performance.now();
	try {
		return await work();
	} finally {
		heldFor(request).spans.push({ stage, start, end: performance.now() });
	}
}

const ENTRY = /^\s*([a-z]+)\s*;(?:.*?;)?\s*dur=([0-9.]+)/;

/** Adds an answer's `Server-Timing` (the service's) to the request's sums. Unknown or malformed entries are skipped. */
export function noteServiceTiming(request: Request, header: string | null): void {
	if (header === null) return;
	const sums = heldFor(request).service;
	for (const entry of header.split(",")) {
		const m = ENTRY.exec(entry);
		const name = m?.[1];
		const dur = Number(m?.[2]);
		if (name === undefined || !SERVICE.includes(name) || !Number.isFinite(dur)) continue;
		sums.set(name, (sums.get(name) ?? 0) + dur);
	}
}

/** The time some span was running (overlaps counted once): what the page waited. */
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

/** The `Server-Timing` value for what this request noted, with the whole answer's time as `total`. */
export function timingHeader(c: Context, totalMs: number): string {
	const held = seen.get(c.req.raw) ?? { spans: [], service: new Map<string, number>() };
	const parts: string[] = [];
	for (const stage of STAGES) {
		const of = held.spans.filter((s) => s.stage === stage);
		if (of.length === 0) continue;
		const sum = of.reduce((n, s) => n + (s.end - s.start), 0);
		parts.push(`${stage};dur=${wall(of).toFixed(1)};desc="${of.length}x ${sum.toFixed(1)}ms"`);
	}
	for (const name of SERVICE) {
		const sum = held.service.get(name);
		if (sum !== undefined) parts.push(`svc-${name};dur=${sum.toFixed(1)};desc="sum over calls"`);
	}
	// What the noted stages leave: this console's own work (rendering, the middleware) and anything not noted.
	const waited = wall(held.spans);
	parts.push(`console;dur=${Math.max(0, totalMs - waited).toFixed(1)}`);
	parts.push(`total;dur=${totalMs.toFixed(1)}`);
	return parts.join(", ");
}

/**
 * Every page says where its time went (`Server-Timing`), so a slow page is read from its own header in the browser's
 * network panel instead of guessed. Durations only: no values, no names.
 */
export function serverTiming(): MiddlewareHandler {
	return async (c, next) => {
		const start = performance.now();
		await next();
		c.res.headers.set("server-timing", timingHeader(c, performance.now() - start));
	};
}
