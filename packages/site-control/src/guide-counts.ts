import { AsyncLocalStorage } from "node:async_hooks";
import { type Counter, CounterBatch, counterId } from "@psi/cms-client";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

/**
 * The guide's daily totals, sent to the CMS's reading counters (`POST /api/analytics/ingest`,
 * `Authorization: Bearer ANALYTICS_INGEST_TOKEN`, the blog collector's contract): how many
 * questions were asked today, per brand and locale, how many the knowledge could not answer, and
 * how the invitation fares (the capsule opened, the nudge shown, the nudge clicked).
 * Never the question, never who asked. A visitor with Do-Not-Track or GPC is not counted, nor a
 * crawler or a prefetch (the blog's rule).
 */
export type GuideMetric =
	| "guide_asked"
	| "guide_unanswered"
	| "guide_opened"
	| "guide_nudge_shown"
	| "guide_nudge_clicked";
export type CountBrand = "psizone" | "eqsync" | "hemisync";

export interface GuideCountReporter {
	count(metric: GuideMetric, locale: "ro" | "en"): void;
	/** Sends what was counted since the last flush; keeps it on failure, for the next one. */
	flush(): Promise<void>;
}

const BOTS =
	/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python-requests|httpclient|headless|lighthouse|pagespeed/i;

/** Whether this request may move a counter (no identifier is kept either way). */
export function mayCountRequest(h: Headers): boolean {
	if (h.get("dnt") === "1" || h.get("sec-gpc") === "1") return false;
	if (/prefetch|prerender/i.test(`${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""}`)) {
		return false;
	}
	const ua = h.get("user-agent") ?? "";
	return ua !== "" && !BOTS.test(ua);
}

const scope = new AsyncLocalStorage<{ countable: boolean; path: string }>();

/**
 * Marks each request countable or not, and remembers its path for the page being rendered (the
 * compass's nudge fits the page); mount before the routes that ask the guide.
 */
export function countingScope(): MiddlewareHandler {
	return (c, next) =>
		scope.run({ countable: mayCountRequest(c.req.raw.headers), path: c.req.path }, next);
}

/** Outside a request (a test, a script) nothing is counted. */
export function mayCountNow(): boolean {
	return scope.getStore()?.countable === true;
}

/** The path of the request being rendered ("/" outside one). */
export function currentPath(): string {
	return scope.getStore()?.path ?? "/";
}

export function createGuideCountReporter(o: {
	brand: CountBrand;
	cmsUrl: string;
	token: string;
	now?: () => number;
	fetch?: typeof fetch;
	onError?: (message: string) => void;
}): GuideCountReporter {
	const now = o.now ?? Date.now;
	const f = o.fetch ?? fetch;
	const pending = new Map<string, Counter>();
	return {
		count(metric, locale) {
			const key = {
				day: new Date(now()).toISOString().slice(0, 10),
				brand: o.brand,
				slug: "" as const,
				locale,
				topic: null,
				metric,
			};
			const id = counterId(key);
			const prev = pending.get(id);
			pending.set(id, { ...key, count: (prev?.count ?? 0) + 1 });
		},
		async flush() {
			if (pending.size === 0) return;
			const batch = [...pending.values()];
			pending.clear();
			try {
				const r = await f(`${o.cmsUrl}/api/analytics/ingest`, {
					method: "POST",
					headers: { "content-type": "application/json", authorization: `Bearer ${o.token}` },
					body: JSON.stringify(CounterBatch.parse({ counters: batch })),
					signal: AbortSignal.timeout(5000),
				});
				if (!r.ok) throw new Error(`cms ingest answered ${r.status}`);
			} catch (err) {
				// Put them back: a counter is lost only if the process stops before the next flush.
				for (const c of batch) {
					const id = counterId(c);
					const prev = pending.get(id);
					pending.set(id, { ...c, count: c.count + (prev?.count ?? 0) });
				}
				o.onError?.(`guide counts: ${err instanceof Error ? err.message : String(err)}`);
			}
		},
	};
}

const Env = z.object({
	CMS_URL: z
		.string()
		.url()
		.transform((u) => u.replace(/\/+$/, ""))
		.optional(),
	ANALYTICS_INGEST_TOKEN: z.string().min(32).optional(),
	ANALYTICS_FLUSH_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
});

/**
 * The reporter from `CMS_URL` and `ANALYTICS_INGEST_TOKEN`, flushing every
 * ANALYTICS_FLUSH_SECONDS (30 s); null without them (the guide then counts nothing anywhere).
 */
export function guideCountsFromEnv(
	env: Readonly<Record<string, string | undefined>>,
	brand: CountBrand,
): GuideCountReporter | null {
	const e = Env.parse(
		Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== "")),
	);
	if (e.CMS_URL === undefined || e.ANALYTICS_INGEST_TOKEN === undefined) return null;
	const reporter = createGuideCountReporter({
		brand,
		cmsUrl: e.CMS_URL,
		token: e.ANALYTICS_INGEST_TOKEN,
		onError: (m) => console.warn(m),
	});
	setInterval(() => void reporter.flush(), e.ANALYTICS_FLUSH_SECONDS * 1000).unref();
	return reporter;
}
