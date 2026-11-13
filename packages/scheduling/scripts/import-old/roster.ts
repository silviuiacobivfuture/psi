import { blockProblem, rosterProblem } from "../../src/clinic/roster";
import { parseClock } from "../../src/domain/time";
import { practitionerLegacy } from "./mapping";
import type { BlockRow, RosterRow } from "./rows";
import type { Row } from "./source";
import {
	type Ctx,
	clean,
	cleanNote,
	clock,
	day,
	fingerprintOf,
	fold,
	reportExtraColumns,
	timestamp,
} from "./support";

const SCHEDULE_COLUMNS = new Set([
	"id",
	"therapist_id",
	"date",
	"status",
	"start_time",
	"end_time",
	"notes",
	"created_at",
	"updated_at",
]);
const BLOCK_COLUMNS = new Set([
	"id",
	"therapist_id",
	"date_start",
	"date_end",
	"reason",
	"notes",
	"created_at",
]);

export interface RosterOut {
	roster: RosterRow[];
	blocks: BlockRow[];
}

type Person = { kind: "practitioner" | "staff"; legacyId: string };

/** Who a roster or block row is about: a practitioner, roster-only staff, or nobody the export knows. */
function personOf(
	ctx: Ctx,
	id: number | null | undefined,
	known: { practitionerIds: ReadonlySet<number>; staffIds: ReadonlySet<number> },
	ref: string,
): Person | undefined {
	if (id === null || id === undefined) {
		ctx.log.add("roster_without_person", "skipped", ref);
		return undefined;
	}
	if (known.practitionerIds.has(id))
		return { kind: "practitioner", legacyId: practitionerLegacy(id) };
	if (known.staffIds.has(id)) return { kind: "staff", legacyId: practitionerLegacy(id) };
	if (ctx.mapping.therapistResources[String(id)] !== undefined) {
		ctx.log.add("roster_for_a_device_or_room", "skipped", ref);
		return undefined;
	}
	ctx.log.add("orphan_roster_person", "skipped", ref);
	return undefined;
}

/** `lucreaza`, `concediu`, `liber`, `(CM)` (any case, with or without diacritics or brackets). */
export function rosterStatus(
	raw: string | null | undefined,
): "works" | "annual_leave" | "medical_leave" | "free" | undefined {
	const t = fold(raw).replace(/[()]/g, "").trim();
	if (t === "lucreaza") return "works";
	if (t === "concediu") return "annual_leave";
	if (t === "cm") return "medical_leave";
	if (t === "liber") return "free";
	return undefined;
}

export async function planRoster(
	ctx: Ctx,
	schedule: ReadonlyArray<Row<"staff_schedule">>,
	blocks: ReadonlyArray<Row<"staff_blocks">>,
	known: { practitionerIds: ReadonlySet<number>; staffIds: ReadonlySet<number> },
): Promise<RosterOut> {
	const out: RosterOut = { roster: [], blocks: [] };
	for (const r of schedule) {
		const ref = `staff_schedule:${r.id}`;
		reportExtraColumns(ctx, "staff_schedule", r.id, r, SCHEDULE_COLUMNS);
		const person = personOf(ctx, r.therapist_id, known, ref);
		if (person === undefined) continue;
		const date = day(r.date);
		const status = rosterStatus(r.status);
		if (date === undefined || status === undefined) {
			ctx.log.add(date === undefined ? "bad_roster_date" : "unknown_roster_status", "skipped", ref);
			continue;
		}
		let startMinutes: number | undefined;
		let endMinutes: number | undefined;
		if (status === "works") {
			const s = clock(r.start_time);
			const e = clock(r.end_time);
			if (s !== undefined && e !== undefined) {
				startMinutes = parseClock(s);
				endMinutes = parseClock(e);
			}
			const entry = {
				status: "works" as const,
				startMinutes: startMinutes ?? Number.NaN,
				endMinutes: endMinutes ?? Number.NaN,
			};
			if (rosterProblem(entry) !== undefined) {
				ctx.log.add("roster_works_without_valid_hours", "skipped", ref);
				continue;
			}
		}
		out.roster.push({
			legacyId: ref,
			fingerprint: await fingerprintOf(ctx, "staff_schedule", r),
			person,
			date,
			status,
			startMinutes,
			endMinutes,
			notes: cleanNote(r.notes),
		});
	}
	for (const b of blocks) {
		const ref = `staff_blocks:${b.id}`;
		reportExtraColumns(ctx, "staff_blocks", b.id, b, BLOCK_COLUMNS);
		const person = personOf(ctx, b.therapist_id, known, ref);
		if (person === undefined) continue;
		const dateStart = day(b.date_start);
		const dateEnd = day(b.date_end) ?? dateStart;
		if (dateStart === undefined || dateEnd === undefined) {
			ctx.log.add("bad_block_date", "skipped", ref);
			continue;
		}
		const problem = blockProblem({ dateStart, dateEnd, reason: clean(b.reason) ?? "" });
		if (problem !== undefined) {
			ctx.log.add(`block_${problem}`, "skipped", ref);
			continue;
		}
		out.blocks.push({
			legacyId: ref,
			fingerprint: await fingerprintOf(ctx, "staff_blocks", b),
			person,
			dateStart,
			dateEnd,
			reason: clean(b.reason) ?? "-",
			notes: cleanNote(b.notes),
			createdAt: timestamp(b.created_at) ?? ctx.exportedAt,
		});
	}
	return out;
}
