import { SchedulingUnavailable } from "@psi/scheduling";
import { createPicker } from "./booking-picker";
import type { BookingDeps } from "./booking-submit";
import { createIntake } from "./callback-intake";
import { ESTATE, SITE } from "./estate";
import { callbackListUrl, readMailEnv } from "./mail-config";
import { createSmtpMailer } from "./mailer";
import { createVisitorScheduling, type VisitorScheduling } from "./scheduling-api-client";
import { readSchedulingApiEnv } from "./scheduling-api-env";

/**
 * Psizone's evaluation calendar (docs/plans/scheduling.md), booked through the scheduling service
 * (`SCHEDULING_API_URL`, this site's `SCHEDULING_SERVICE_KEY`). Without the URL it is off and the
 * booking forms are today's callback form, unchanged; so is any lookup that fails or times out.
 */
export const TENANT = "psizone";

const SCHEDULING = readSchedulingApiEnv(process.env);
if (!SCHEDULING.ok && SCHEDULING.problem !== "no_url") {
	console.error(`scheduling: off (${SCHEDULING.problem})`);
}
/** The one scheduling client of the site: the booking forms, the callback intake and the guide's port share it. */
export const scheduling: VisitorScheduling | undefined = SCHEDULING.ok
	? createVisitorScheduling(SCHEDULING.config, TENANT)
	: undefined;

export function schedulingFailed(error: unknown): void {
	const why = error instanceof SchedulingUnavailable ? error.message : "unexpected failure";
	console.error(`scheduling: ${why}`);
}

/** What the booking forms draw of the calendar, read from the service on every request. */
export const picker = createPicker(scheduling, TENANT, Date.now, schedulingFailed);

/** The team's e-mail (docs/plans/clinic.md slice 0): optional; without it requests are only stored. */
const MAIL = readMailEnv(process.env);
if (!MAIL.ok && MAIL.problem === "invalid") {
	console.error(`mail: off (invalid: ${MAIL.keys.join(", ")})`);
}

/** Stores every callback request and e-mails the team; the visitor is thanked only if one worked. */
export const intake = createIntake({
	tenant: TENANT,
	store: scheduling,
	mailer: MAIL.ok ? createSmtpMailer(MAIL.config) : undefined,
	notifyTo: MAIL.ok ? MAIL.config.notifyTo : [],
	site: new URL(ESTATE[SITE]).host,
	zone: "Europe/Bucharest",
	listUrl: callbackListUrl(process.env, TENANT),
	now: Date.now,
	log: (line) => console.error(line),
});

export const bookingDeps: BookingDeps = {
	scheduling,
	picker,
	intake,
	tenant: TENANT,
	failed: schedulingFailed,
};
