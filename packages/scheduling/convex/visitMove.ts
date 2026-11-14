import { visitProblems } from "../src/clinic/visits";
import { MINUTE_MS } from "../src/domain/time";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { busyOfVisitsInfo } from "./visitConflicts";
import { links, resolveColumn } from "./visitLinks";

/** What a move asks for: a new time, and optionally another column, room or device. */
export interface MoveArgs {
	start: number;
	end: number;
	column?: { kind: "practitioner" | "device" | "room" | "group"; id: string } | undefined;
	room?: string | undefined;
	device?: string | undefined;
}

/** A move that passed every check but the blacklist and the overlap: what to write. */
export interface PreparedMove {
	column: Doc<"visits">["column"];
	room: Id<"rooms"> | undefined;
	device: Id<"devices"> | undefined;
	durationMinutes: number;
	/** The names of the fields it changes, for the audit event. */
	fields: string[];
}

/**
 * The part of moving a visit that reads only the request: the column, room and device exist in the app, the time is
 * sound. Shared by `apiVisits.move` and `apiVisitEdit.edit`, so a move is refused for the same reasons in both.
 */
export async function prepareMove(
	ctx: QueryCtx,
	tenant: string,
	row: Doc<"visits">,
	args: MoveArgs,
): Promise<{ ok: true; move: PreparedMove } | { ok: false; reason: string }> {
	const column =
		args.column === undefined ? row.column : await resolveColumn(ctx, tenant, args.column);
	if (column === null) return { ok: false, reason: "unknown_column" };
	const linked = await links(ctx, tenant, { room: args.room, device: args.device });
	if (!linked.ok) return { ok: false, reason: linked.reason };
	const durationMinutes = Math.round((args.end - args.start) / MINUTE_MS);
	const problems = visitProblems({ column, start: args.start, end: args.end, durationMinutes });
	if (problems.length > 0) return { ok: false, reason: problems[0] ?? "invalid" };
	return {
		ok: true,
		move: {
			column,
			room: args.room === undefined ? row.room : linked.room,
			device: args.device === undefined ? row.device : linked.device,
			durationMinutes,
			fields: [
				"start",
				"end",
				...(args.column === undefined ? [] : ["column"]),
				...(args.room === undefined ? [] : ["room"]),
				...(args.device === undefined ? [] : ["device"]),
			],
		},
	};
}

/** What the prepared move would take that something else already has: the person, the room or the device. */
export function moveTakenBy(
	ctx: QueryCtx,
	tenant: string,
	row: Doc<"visits">,
	move: PreparedMove,
	args: Pick<MoveArgs, "start" | "end">,
): Promise<"practitioner" | "room" | "device" | undefined> {
	return busyOfVisitsInfo(ctx, tenant, {
		column: move.column,
		room: move.room,
		device: move.device,
		start: args.start,
		end: args.end,
		except: row._id,
	});
}
