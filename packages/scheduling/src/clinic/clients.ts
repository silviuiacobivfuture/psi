/**
 * A client's standing, kept apart on purpose (docs/plans/clinic.md section 2, reception's #4):
 * `status` is the clinical relationship (active, paused, finished); ARCHIVE hides the client from
 * the working list and is undone with one click; DELETE is soft for 30 days (recoverable by an
 * owner) and then erased by the clinic's own job. Delete does not need archive first.
 */
export const CLIENT_STATUSES = ["active", "paused", "finished"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const RECOVERY_DAYS = 30;
const DAY_MS = 86_400_000;

export interface ClientStanding {
	archivedAt?: number;
	deletedAt?: number;
}

export type Visibility = "listed" | "archived" | "deleted";

export function visibilityOf(c: ClientStanding): Visibility {
	if (c.deletedAt !== undefined) return "deleted";
	return c.archivedAt === undefined ? "listed" : "archived";
}

export type StandingRefusal =
	| "already_archived"
	| "not_archived"
	| "already_deleted"
	| "not_deleted"
	| "recovery_expired";

export type StandingChange =
	| { ok: true; patch: ClientStanding }
	| { ok: false; reason: StandingRefusal };

export function archive(c: ClientStanding, now: number): StandingChange {
	if (c.deletedAt !== undefined) return { ok: false, reason: "already_deleted" };
	if (c.archivedAt !== undefined) return { ok: false, reason: "already_archived" };
	return { ok: true, patch: { archivedAt: now } };
}

export function unarchive(c: ClientStanding): StandingChange {
	if (c.deletedAt !== undefined) return { ok: false, reason: "already_deleted" };
	if (c.archivedAt === undefined) return { ok: false, reason: "not_archived" };
	return { ok: true, patch: {} };
}

/** Soft delete: from listed or archived. The archive date is kept, so a restore returns it as it was. */
export function softDelete(c: ClientStanding, now: number): StandingChange {
	if (c.deletedAt !== undefined) return { ok: false, reason: "already_deleted" };
	return { ok: true, patch: { deletedAt: now } };
}

export function restore(c: ClientStanding, now: number): StandingChange {
	if (c.deletedAt === undefined) return { ok: false, reason: "not_deleted" };
	if (now >= c.deletedAt + RECOVERY_DAYS * DAY_MS) return { ok: false, reason: "recovery_expired" };
	return { ok: true, patch: {} };
}

/** True once the 30 days are over and the erasure job may erase the client and what hangs on it. */
export function erasureDue(c: ClientStanding, now: number): boolean {
	return c.deletedAt !== undefined && now >= c.deletedAt + RECOVERY_DAYS * DAY_MS;
}
