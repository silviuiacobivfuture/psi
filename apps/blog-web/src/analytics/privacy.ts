/**
 * Whether a request may be counted at all. Nothing about the visitor is kept either way; this
 * only decides whether a counter moves:
 * - Do-Not-Track (`DNT: 1`) or Global Privacy Control (`Sec-GPC: 1`): never counted;
 * - crawlers, link previews and prefetches: not readers, not counted.
 */
const BOTS =
	/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|curl|wget|python-requests|httpclient|headless|lighthouse|pagespeed/i;

export interface RequestHeaders {
	get(name: string): string | null | undefined;
}

/** The visitor asked not to be tracked (DNT or GPC). */
export function optedOut(h: RequestHeaders): boolean {
	return h.get("dnt") === "1" || h.get("sec-gpc") === "1";
}

export function mayCount(h: RequestHeaders): boolean {
	if (optedOut(h)) return false;
	const purpose = `${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""}`;
	if (/prefetch|prerender/i.test(purpose)) return false;
	const ua = h.get("user-agent") ?? "";
	return ua !== "" && !BOTS.test(ua);
}
