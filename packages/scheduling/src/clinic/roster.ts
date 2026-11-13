import { isLocalDate, type LocalDate } from "../domain/time";

/**
 * The roster: per person, per day: works (with hours), annual leave (CO), medical leave (CM) or
 * free. A person is a practitioner or a staff member (reception, volunteer). Blocks are date
 * ranges with a reason ("training", "holiday").
 */
export const ROSTER_STATUSES = ["works", "annual_leave", "medical_leave", "free"] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

export type RosterEntry =
	| { status: "works"; startMinutes: number; endMinutes: number }
	| { status: "annual_leave" }
	| { status: "medical_leave" }
	| { status: "free" };

export type RosterProblem = "hours_required" | "hours_out_of_range" | "hours_not_ordered";

export function rosterProblem(entry: RosterEntry): RosterProblem | undefined {
	if (entry.status !== "works") return undefined;
	const { startMinutes, endMinutes } = entry;
	if (!Number.isInteger(startMinutes) || !Number.isInteger(endMinutes)) return "hours_required";
	if (startMinutes < 0 || endMinutes > 1440) return "hours_out_of_range";
	return startMinutes < endMinutes ? undefined : "hours_not_ordered";
}

export interface StaffBlock {
	dateStart: LocalDate;
	dateEnd: LocalDate;
	reason: string;
}

export type BlockProblem = "bad_date" | "ends_before_start";

export function blockProblem(block: StaffBlock): BlockProblem | undefined {
	if (!isLocalDate(block.dateStart) || !isLocalDate(block.dateEnd)) return "bad_date";
	return block.dateEnd < block.dateStart ? "ends_before_start" : undefined;
}

export type DayAvailability =
	| { kind: "works"; startMinutes: number; endMinutes: number }
	| { kind: "off"; why: "annual_leave" | "medical_leave" | "free" | "blocked" | "unplanned" };

/** Whether a person is there on a date: leave and blocks beat working hours; no entry is unplanned. */
export function dayAvailability(
	entry: RosterEntry | undefined,
	blocks: ReadonlyArray<StaffBlock>,
	date: LocalDate,
): DayAvailability {
	if (entry?.status === "annual_leave" || entry?.status === "medical_leave") {
		return { kind: "off", why: entry.status };
	}
	if (blocks.some((b) => b.dateStart <= date && date <= b.dateEnd)) {
		return { kind: "off", why: "blocked" };
	}
	if (entry === undefined) return { kind: "off", why: "unplanned" };
	if (entry.status === "free") return { kind: "off", why: "free" };
	return { kind: "works", startMinutes: entry.startMinutes, endMinutes: entry.endMinutes };
}
