import { callbackListUrl, createSmtpMailer, readMailEnv } from "@psi/scheduling";
import {
	createBookingDeps,
	createVisitorScheduling,
	readSchedulingApiEnv,
	type VisitorScheduling,
} from "@psi/ui";
import { callbackMailCopy, site } from "./booking-site";
import { ESTATE, SITE } from "./estate";

/**
 * Psizone's evaluation calendar (docs/plans/scheduling.md), booked through the scheduling service
 * (`SCHEDULING_API_URL`, this site's `SCHEDULING_SERVICE_KEY`). Without the URL it is off and the
 * booking forms are the callback form alone; so is any lookup that fails or times out.
 */
const SCHEDULING = readSchedulingApiEnv(process.env);
if (!SCHEDULING.ok && SCHEDULING.problem !== "no_url") {
	console.error(`scheduling: off (${SCHEDULING.problem})`);
}
/** The one scheduling client of the site: the booking forms, the callback intake and the guide's port share it. */
export const scheduling: VisitorScheduling | undefined = SCHEDULING.ok
	? createVisitorScheduling(SCHEDULING.config, site.tenant)
	: undefined;

/** The team's e-mail (docs/plans/clinic.md slice 0): optional; without it requests are only stored. */
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

export const picker = bookingDeps.picker;
