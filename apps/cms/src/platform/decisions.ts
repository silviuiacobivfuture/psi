import { DECISION_REASONS } from "@psi/scheduling";
import { z } from "zod";
import type { Brand } from "../authz/types";
import { notifyBooking, schedulingStaff } from "./services";

/**
 * Confirming, declining or cancelling a request, once, for the Requests list and the calendar:
 * through the staff client, the reason one of DECISION_REASONS (never free text), and the person
 * told through the PWA hook when it is configured.
 */
export const Decision = z.object({
	reference: z.string().min(4).max(32),
	decision: z.enum(["confirm", "decline", "cancel"]),
	reason: z.enum(DECISION_REASONS).optional(),
});
export type Decision = z.infer<typeof Decision>;

export async function decideRequest(
	brand: Brand,
	actor: string,
	tenant: string,
	d: Decision,
): Promise<{ done?: string; error?: string; note?: string }> {
	const staff = schedulingStaff();
	if (staff === null) throw new Error("scheduling not configured");
	const r = await staff.decide({
		tenant,
		reference: d.reference,
		decision: d.decision,
		...(d.decision === "confirm" || d.reason === undefined ? {} : { reason: d.reason }),
		actor: { subject: `cms:${actor}` },
	});
	if (!r.ok) return { error: r.reason === "not_found" ? "notFound" : "invalid" };
	const who = r.accountHash === undefined ? {} : { accountHash: r.accountHash };
	const told = await notifyBooking(
		brand,
		d.decision === "confirm"
			? { kind: "booking.confirmed", reference: r.reference, start: r.start, ...who }
			: { kind: "booking.cancelled", reference: r.reference, ...who },
	);
	return {
		done: told === "sent" ? "notified" : told === "no_device" ? "notNotified" : "done",
		// The log keeps what was decided and why (an administrative code), and whether the person was told.
		note: `${d.decision}${d.decision === "confirm" || d.reason === undefined ? "" : `: ${d.reason}`} (push: ${told})`,
	};
}
