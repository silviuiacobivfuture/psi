import {
	REVALIDATE_PATH,
	type RevalidateEvent,
	SIGNATURE_HEADER,
	signRevalidation,
} from "@psi/cms-client";
import type { PayloadRequest } from "payload";
import { env } from "../env";

/**
 * Tells every site that something it caches changed. Fire and forget: a site that does not
 * answer keeps its cache until its own refresh, and the editor's save never waits on it or fails
 * because of it.
 */
export async function notifySites(req: PayloadRequest, event: RevalidateEvent): Promise<void> {
	const e = env();
	if (e.CMS_REVALIDATE_SECRET === undefined || e.SITE_WEBHOOK_URLS.length === 0) return;
	const { body, signature } = signRevalidation(event, e.CMS_REVALIDATE_SECRET);
	await Promise.all(
		e.SITE_WEBHOOK_URLS.map(async (site) => {
			try {
				const r = await fetch(`${site}${REVALIDATE_PATH}`, {
					method: "POST",
					headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signature },
					body,
					signal: AbortSignal.timeout(3000),
				});
				if (!r.ok) req.payload.logger.warn({ site, status: r.status }, "revalidate: refused");
			} catch (err) {
				req.payload.logger.warn({ site, err: String(err) }, "revalidate: unreachable");
			}
		}),
	);
}
