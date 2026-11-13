import {
	type BlacklistHit,
	blacklistGate,
	type GateOutcome,
	type OverrideAuthority,
} from "@psi/scheduling/clinic";
import type { BlacklistEntry } from "../port/schema-clinical";
import type { Can } from "./can";

/** How much an override of this person is worth: an administrator's, a staff member's, or only an acknowledgement. */
export function authorityOf(can: Can): OverrideAuthority {
	if (can.write("blacklist_override_admin")) return "admin";
	if (can.write("blacklist_override")) return "staff";
	return "ack";
}

/**
 * What booking this client does: the engine's own staff gate, fed the entry the console knows. A warning needs the
 * reason typed (an acknowledgement); a block needs the reason and an authority at least as strong as it asks.
 */
export function bookingGate(entry: BlacklistEntry | null, reason: string, can: Can): GateOutcome {
	if (entry === null) return { outcome: "allow" };
	const hit: BlacklistHit = {
		entry: {
			id: entry.id,
			reason: entry.reason,
			category: entry.category,
			severity: entry.severity,
			active: true,
			createdAt: 0,
		},
		matched: ["client"],
		via: "client",
		nameAgrees: false,
	};
	const text = reason.trim();
	return blacklistGate(
		"staff",
		hit,
		text === "" ? undefined : { reason: text, authority: authorityOf(can) },
	);
}
