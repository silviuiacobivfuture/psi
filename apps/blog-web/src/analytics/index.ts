import { resolve } from "node:path";
import { getConnInfo } from "@hono/node-server/conninfo";
import { DEPTHS, type Depth } from "@psi/cms-client";
import type { Guide } from "@psi/guide";
import type { GuideCountReporter } from "@psi/site-control";
import type { Context } from "hono";
import { z } from "zod";
import { findArticle } from "../content/articles";
import type { Locale } from "../i18n";
import { createCollector } from "./collector";
import { mayCount, optedOut } from "./privacy";
import { type CounterSink, cmsSink, fileSink, noSink } from "./sinks";

/**
 * First-party, cookieless reading analytics (docs/plans/blog-platform.md, Analytics):
 * the beacon posts to /_a, this module counts, and every ANALYTICS_FLUSH_SECONDS the counters go
 * to the sink — the CMS (`cms`, when CMS_URL and ANALYTICS_INGEST_TOKEN are set), the local
 * dev store (`file`, .data/analytics.json) or nowhere (`none`).
 */
const Env = z.object({
	ANALYTICS_SINK: z.enum(["cms", "file", "none"]).optional(),
	ANALYTICS_FILE: z.string().min(1).default(".data/analytics.json"),
	ANALYTICS_FLUSH_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
	ANALYTICS_INGEST_TOKEN: z.string().min(32).optional(),
	CMS_URL: z
		.string()
		.url()
		.transform((u) => u.replace(/\/+$/, ""))
		.optional(),
});
const env = Env.parse(
	Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== "")),
);

function sinkFromEnv(): CounterSink {
	const cms =
		env.CMS_URL !== undefined && env.ANALYTICS_INGEST_TOKEN !== undefined
			? cmsSink(env.CMS_URL, env.ANALYTICS_INGEST_TOKEN)
			: null;
	const kind = env.ANALYTICS_SINK ?? (cms !== null ? "cms" : "file");
	if (kind === "cms") return cms ?? noSink;
	if (kind === "file") return fileSink(resolve(env.ANALYTICS_FILE));
	return noSink;
}

export const collector = createCollector({ sink: sinkFromEnv() });

/**
 * Starts the periodic flush. No signal handler on purpose: a SIGTERM listener would replace Node's
 * default exit and keep a stopping pod alive; at most one flush interval of counters is lost.
 */
export function startAnalytics(): void {
	setInterval(() => void collector.flush(), env.ANALYTICS_FLUSH_SECONDS * 1000).unref();
}

const Beacon = z.object({
	e: z.enum(["view", "depth"]),
	s: z.string().min(1).max(120),
	l: z.enum(["ro", "en"]),
	d: z.coerce.number().int().optional(),
});

/** Who, for today's dedupe only: the connecting address and the browser string (never stored). */
function who(c: Context): string {
	const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
	let address = forwarded ?? "";
	if (address === "") {
		try {
			address = getConnInfo(c).remote.address ?? "";
		} catch {
			address = "";
		}
	}
	return `${address}|${c.req.header("user-agent") ?? ""}`;
}

/** POST /_a — always 204: a refused or uncounted hit looks exactly like a counted one. */
export function beaconRoute(c: Context): Response {
	const q = Beacon.safeParse(c.req.query());
	const article = q.success ? findArticle(q.data.s) : undefined;
	if (
		!q.success ||
		article === undefined ||
		article.status === "in-review" ||
		!mayCount(c.req.raw.headers)
	) {
		return c.body(null, 204);
	}
	const base = { brand: article.brand, slug: article.slug, locale: q.data.l, topic: article.topic };
	if (q.data.e === "view") collector.hit({ ...base, metric: "view" }, who(c));
	else {
		// "Reached at least": a reader who jumps to the end has also passed 25, 50 and 75.
		const d = q.data.d ?? 0;
		for (const t of DEPTHS.filter((x: Depth) => x <= d)) {
			collector.hit({ ...base, metric: `depth_${t}` }, who(c));
		}
	}
	return c.body(null, 204);
}

/** Whether to render the beacon at all for this request (DNT/GPC: no). */
export function trackable(c: Context): boolean {
	return !optedOut(c.req.raw.headers);
}

/**
 * The guide, counting: every question asked and every one the knowledge could not answer
 * (`no_content`), per locale. The question itself is never looked at or kept.
 */
export function countingGuide(guide: Guide, locale: Locale, count: boolean): Guide {
	if (!count) return guide;
	return {
		brand: guide.brand,
		model: guide.model,
		async *ask(input, control) {
			const key = { brand: "blog" as const, slug: "" as const, locale, topic: null };
			collector.count({ ...key, metric: "guide_asked" });
			for await (const event of guide.ask(input, control)) {
				if (event.type === "refusal" && event.reason === "no_content") {
					collector.count({ ...key, metric: "guide_unanswered" });
				}
				yield event;
			}
		},
	};
}

/**
 * The compass's invitation counters (opened, nudge shown, nudge clicked) go to the same
 * collector as the questions: a number per day and locale, never a person.
 */
export const guideCounts: GuideCountReporter = {
	count: (metric, locale) =>
		collector.count({ brand: "blog", slug: "", locale, topic: null, metric }),
	flush: () => collector.flush(),
};
