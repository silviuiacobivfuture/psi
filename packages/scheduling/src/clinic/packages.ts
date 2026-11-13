import type { AppointmentStatus } from "../domain/conflicts";
import type { Attendance, CreditType } from "./visits";

/**
 * Packages ("abonamente"): sessions bought in advance. NOTHING here is a stored counter: what is
 * used comes from the visits linked to the package, so it cannot drift from the calendar.
 * A visit uses a session when it is confirmed, has started, and was not marked absent; one still
 * to come is scheduled, not used; a cancelled or absent one uses nothing.
 */
export interface PackageTerms {
	totalSessions: number;
	bonusSessions: number;
}

export interface LinkedVisit {
	status: AppointmentStatus;
	attendance: Attendance;
	creditType: CreditType;
	start: number;
}

export interface Usage {
	baseUsed: number;
	bonusUsed: number;
	baseScheduled: number;
	bonusScheduled: number;
}

export function usageOf(visits: ReadonlyArray<LinkedVisit>, now: number): Usage {
	const usage: Usage = { baseUsed: 0, bonusUsed: 0, baseScheduled: 0, bonusScheduled: 0 };
	for (const v of visits) {
		if (v.status !== "confirmed" || v.attendance === "absent") continue;
		const past = v.start <= now || v.attendance === "attended";
		if (v.creditType === "base") {
			if (past) usage.baseUsed += 1;
			else usage.baseScheduled += 1;
		} else if (past) usage.bonusUsed += 1;
		else usage.bonusScheduled += 1;
	}
	return usage;
}

export interface Remaining {
	baseRemaining: number;
	bonusRemaining: number;
	/** Sessions still to use, base and bonus. */
	remaining: number;
	/** Remaining and not yet booked in the calendar. */
	unbooked: number;
	/** Sessions used beyond what was bought (a defect to look at, never hidden by clamping). */
	overdrawn: number;
}

export function remainingSessions(terms: PackageTerms, usage: Usage): Remaining {
	const baseRemaining = Math.max(0, terms.totalSessions - usage.baseUsed);
	const bonusRemaining = Math.max(0, terms.bonusSessions - usage.bonusUsed);
	const remaining = baseRemaining + bonusRemaining;
	return {
		baseRemaining,
		bonusRemaining,
		remaining,
		unbooked: Math.max(0, remaining - usage.baseScheduled - usage.bonusScheduled),
		overdrawn:
			Math.max(0, usage.baseUsed - terms.totalSessions) +
			Math.max(0, usage.bonusUsed - terms.bonusSessions),
	};
}

/**
 * The credit a new visit of this package should take: base first, then bonus; undefined when
 * every session, used or already scheduled, is accounted for.
 */
export function nextCredit(terms: PackageTerms, usage: Usage): CreditType | undefined {
	if (usage.baseUsed + usage.baseScheduled < terms.totalSessions) return "base";
	if (usage.bonusUsed + usage.bonusScheduled < terms.bonusSessions) return "bonus";
	return undefined;
}

/** Stored-vs-derived usage: the numbers the old app kept, against what the visits say. */
export interface UsageMismatch {
	storedBase: number;
	derivedBase: number;
	storedBonus: number;
	derivedBonus: number;
}

export function usageMismatch(
	stored: { used: number; bonusUsed: number },
	usage: Usage,
): UsageMismatch | undefined {
	return stored.used === usage.baseUsed && stored.bonusUsed === usage.bonusUsed
		? undefined
		: {
				storedBase: stored.used,
				derivedBase: usage.baseUsed,
				storedBonus: stored.bonusUsed,
				derivedBonus: usage.bonusUsed,
			};
}
