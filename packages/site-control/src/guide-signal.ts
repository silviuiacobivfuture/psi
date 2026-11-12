import type { Handler } from "hono";
import { z } from "zod";
import { type GuideCountReporter, type GuideMetric, mayCountNow } from "./guide-counts";

/**
 * What the compass reports about its invitation: the sheet was opened, the nudge was shown, the
 * nudge was clicked. A counter step each (never who, never a text); `guide_asked` already counts
 * the questions themselves.
 */
export const GUIDE_SIGNALS = {
	open: "guide_opened",
	nudge: "guide_nudge_shown",
	nudge_click: "guide_nudge_clicked",
} as const satisfies Record<string, GuideMetric>;

const Body = z.object({ e: z.enum(["open", "nudge", "nudge_click"]) }).strict();

/**
 * The route the page posts those to (`<prefix>/ghid/signal`, under the guide's own path). 204 for
 * anything well-formed, counted only for a countable visitor (DNT, GPC and crawlers are not);
 * 400 for anything else, counting nothing.
 */
export function guideSignal(o: {
	reporter: GuideCountReporter | null;
	locale: "ro" | "en";
}): Handler {
	return async (c) => {
		const body = Body.safeParse(await c.req.json().catch(() => null));
		if (!body.success) return c.body(null, 400);
		if (o.reporter !== null && mayCountNow()) {
			o.reporter.count(GUIDE_SIGNALS[body.data.e], o.locale);
		}
		return c.body(null, 204);
	};
}
