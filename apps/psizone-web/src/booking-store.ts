import { SchedulingUnavailable, schedulingFromEnv } from "@psi/guide";
import { createPicker } from "./booking-picker";

/**
 * Psizone's evaluation calendar (docs/plans/scheduling.md). Without `CONVEX_URL` it is off and the
 * booking forms are today's callback form, unchanged; so is any lookup that fails or times out.
 */
export const TENANT = "psizone";

const SCHEDULING = schedulingFromEnv(process.env);
if (!SCHEDULING.ok && SCHEDULING.problem !== "no_url") {
	console.error(`scheduling: off (${SCHEDULING.problem})`);
}
export const scheduling = SCHEDULING.ok ? SCHEDULING.scheduling.client : undefined;

export function schedulingFailed(error: unknown): void {
	const why = error instanceof SchedulingUnavailable ? error.message : "unexpected failure";
	console.error(`scheduling: ${why}`);
}

/** What the booking forms draw of the calendar, read from the store on every request. */
export const picker = createPicker(scheduling, TENANT, Date.now, schedulingFailed);
