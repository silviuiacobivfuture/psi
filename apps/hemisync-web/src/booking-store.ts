import { schedulingFromEnv } from "@psi/guide";
import { callbackListUrl, createSmtpMailer, readMailEnv } from "@psi/scheduling";
import { createBookingDeps } from "@psi/ui";
import { callbackMailCopy, site } from "./booking-site";
import { ESTATE, SITE } from "./estate";

/**
 * Hemi-Sync's calendar (docs/plans/scheduling.md). Without `CONVEX_URL` it is off and the booking
 * forms are the callback form alone; so is any lookup that fails or times out, and a store with
 * no `hemisync` services yet: the page never shows another site's times.
 */
const SCHEDULING = schedulingFromEnv(process.env);
if (!SCHEDULING.ok && SCHEDULING.problem !== "no_url") {
	console.error(`scheduling: off (${SCHEDULING.problem})`);
}
export const scheduling = SCHEDULING.ok ? SCHEDULING.scheduling.client : undefined;

/** The team's e-mail: optional; without it requests are only stored (and listed in the CMS). */
const MAIL = readMailEnv(process.env);
if (!MAIL.ok && MAIL.problem === "invalid") {
	console.error(`mail: off (invalid: ${MAIL.keys.join(", ")})`);
}

/**
 * What the booking forms draw of the calendar (the picker), and what a callback request does:
 * stored first, then e-mailed to the team; the visitor is thanked only if one worked. Everything
 * is built from `site.tenant`, so this site only ever reaches its own calendar.
 */
export const bookingDeps = createBookingDeps({
	site,
	scheduling,
	mailer: MAIL.ok ? createSmtpMailer(MAIL.config) : undefined,
	notifyTo: MAIL.ok ? MAIL.config.notifyTo : [],
	mailCopy: callbackMailCopy(),
	host: new URL(ESTATE[SITE]).host,
	zone: "Europe/Bucharest",
	listUrl: callbackListUrl(process.env, site.tenant),
});
