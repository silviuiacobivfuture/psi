import { type AppointmentRow, StoreRefused } from "../types";
import { personRef } from "./ids";
import { metaFor, type VisitViewT } from "./visit-rows";

type Column = { kind: "practitioner" | "group"; id: string };

/** The calendar column an API appointment sits in: its practitioner's, or its group's for a group activity. */
export function columnOf(row: AppointmentRow): Column {
	if (row.kind === "group") {
		if (row.groupId === undefined) throw new StoreRefused("invalid");
		return { kind: "group", id: row.groupId };
	}
	const ref = personRef(row.practitionerId);
	if (ref?.kind !== "practitioner") throw new StoreRefused("unknown_practitioner");
	return { kind: "practitioner", id: ref.id };
}

const sameColumn = (a: Column, b: Column): boolean => a.kind === b.kind && a.id === b.id;

/**
 * What changing the stored appointment `cur` (the visit `current`) into `next` asks of `apiVisitEdit:edit`, or
 * `undefined` when nothing the edit carries changed. Everything is one set of arguments, so one mutation applies it or
 * refuses it whole. `force` writes the API's facts even when they did not change (a visit just made has none yet).
 *
 * Refused here, before anything is asked of the store: a note, room or device taken away (they are replaced, never
 * cleared), a client taken off a session or put on a block, and a confirmed appointment sent back to waiting.
 */
export function editArgsOf(
	current: VisitViewT,
	cur: AppointmentRow,
	next: AppointmentRow,
	force: boolean,
): Record<string, unknown> | undefined {
	for (const field of ["note", "roomId", "deviceId"] as const)
		if (cur[field] !== undefined && next[field] === undefined) throw new StoreRefused("invalid");
	if ((cur.clientId === undefined) !== (next.clientId === undefined))
		throw new StoreRefused("invalid");
	if (cur.status === "cancelled" && next.status !== "cancelled")
		throw new StoreRefused("not_allowed");
	if (next.status === "requested" && cur.status !== "requested")
		throw new StoreRefused("not_allowed");

	const curColumn: Column | undefined =
		current.column.kind === "group" || current.column.kind === "practitioner"
			? { kind: current.column.kind, id: current.column.id }
			: undefined;
	const column = columnOf(next);
	const moved =
		next.start !== cur.start ||
		next.end !== cur.end ||
		next.roomId !== cur.roomId ||
		next.deviceId !== cur.deviceId ||
		curColumn === undefined ||
		!sameColumn(curColumn, column);
	const meta = metaFor(next);
	const metaChanged = force || JSON.stringify(meta) !== JSON.stringify(metaFor(cur));
	const price = next.money?.priceCents;
	const edits = {
		...(next.clientId !== cur.clientId && next.clientId !== undefined
			? { client: next.clientId }
			: {}),
		...(next.packageId !== cur.packageId ? { package: next.packageId ?? null } : {}),
		...(next.serviceId !== cur.serviceId && next.serviceId !== undefined
			? { sessionType: next.serviceId }
			: {}),
		...(price !== undefined && price !== cur.money?.priceCents ? { priceMinor: price } : {}),
		...(next.note !== cur.note && next.note !== undefined ? { notes: next.note } : {}),
		...(metaChanged ? { meta } : {}),
		...(cur.status === "requested" && next.status === "scheduled"
			? { confirm: true as const }
			: {}),
		...(moved
			? {
					move: {
						start: next.start,
						end: next.end,
						column,
						...(next.roomId === undefined ? {} : { room: next.roomId }),
						...(next.deviceId === undefined ? {} : { device: next.deviceId }),
					},
				}
			: {}),
	};
	return Object.keys(edits).length === 0 ? undefined : edits;
}
