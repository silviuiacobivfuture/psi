import { addDays } from "./format";
import type { Service } from "./model";
import type { StaffSession } from "./session";
import { today } from "./tools-shared";

/** How far back the clinic's habits are read to find a practitioner's usual service. */
const LOOKBACK_DAYS = 60;
/** A usual service needs at least this many bookings and at least half of the practitioner's. */
const MIN_BOOKINGS = 3;

export type ServiceChoice =
	| {
			kind: "one";
			service: Service;
			/** Why it was chosen without asking: the only service, or what that practitioner usually does. */
			why: "only" | "usual";
	  }
	| { kind: "ask"; candidates: Array<Service> }
	| { kind: "refused"; reason: "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable" };

/**
 * The service to book when the person named none: the clinic's only one, else the one this
 * practitioner most often does (read from their own recent agenda); otherwise the person is asked
 * once, with the real services as buttons. The assistant never guesses beyond this.
 */
export async function defaultService(
	s: StaffSession,
	practitionerId: string | undefined,
): Promise<ServiceChoice> {
	const all = await s.port.services();
	if (!all.ok) return { kind: "refused", reason: all.reason };
	const [only] = all.value;
	if (all.value.length === 1 && only !== undefined)
		return { kind: "one", service: only, why: "only" };
	if (practitionerId !== undefined) {
		const to = today(s);
		const agenda = await s.port.agenda({
			from: addDays(to, -LOOKBACK_DAYS),
			to,
			resourceId: practitionerId,
		});
		if (agenda.ok) {
			const counts = new Map<string, number>();
			for (const a of agenda.value) {
				if (a.status === "cancelled") continue;
				counts.set(a.serviceId, (counts.get(a.serviceId) ?? 0) + 1);
			}
			const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
			const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
			const usual = top === undefined ? undefined : all.value.find((v) => v.id === top[0]);
			if (top !== undefined && usual !== undefined && top[1] >= MIN_BOOKINGS && top[1] * 2 >= total)
				return { kind: "one", service: usual, why: "usual" };
		}
	}
	return { kind: "ask", candidates: [...all.value] };
}
