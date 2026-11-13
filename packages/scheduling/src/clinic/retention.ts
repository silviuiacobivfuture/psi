import { type ClientStanding, erasureDue } from "./clients";

/**
 * The clinic's own retention, separate from the web-request policy (`DEFAULT_RETENTION` in
 * `domain/retention.ts`, which erases booking contacts after 30 days and must never reach a clinic
 * record: those live in other tables and this module is the only thing that decides about them).
 *
 * Clinical history is not erased by age here: the retention period is the owner's decision under
 * the medical-record law (docs/plans/clinic.md section 8) and will be its own setting. What this
 * job does is the 30-day soft-delete: `erase` only for a client deleted more than 30 days ago.
 */
export type ClinicRetentionAction = "keep" | "erase";

export function clinicRetentionAction(c: ClientStanding, now: number): ClinicRetentionAction {
	return erasureDue(c, now) ? "erase" : "keep";
}
