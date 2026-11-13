import { MAX_SERIES } from "@psi/scheduling/clinic";
import { MemoryCollection } from "./memory-collection";
import type { SeriesConflictRow, SeriesPort } from "./ports";
import { type AppointmentRow, StoreRefused } from "./types";

/** The blacklist's answers are about the client, the same for every occurrence: they are the answer, not a conflict. */
const STOPS = new Set(["warning", "blocked"]);

function conflictOf(index: number, row: AppointmentRow, error: StoreRefused): SeriesConflictRow {
	const clashing: unknown = error.detail?.with;
	return {
		index,
		start: row.start,
		reason: error.reason,
		...(clashing === "practitioner" || clashing === "room" || clashing === "device"
			? { with: clashing }
			: {}),
	};
}

/**
 * Weekly series over the in-memory appointments, whose own rules (references, overlaps, the blacklist) are the ones a
 * single appointment meets. All or nothing is kept by undoing what was written when a later row is refused: the writes
 * of the undo go to the collection itself, past the rules (they put back what the rules once allowed).
 */
export function createMemorySeries(appointments: MemoryCollection<AppointmentRow>): SeriesPort {
	const put = (row: AppointmentRow) => MemoryCollection.prototype.replace.call(appointments, row);
	const drop = (app: string, id: string) =>
		MemoryCollection.prototype.remove.call(appointments, app, id);

	return {
		async create(app, rows) {
			const first = rows[0];
			if (first === undefined || rows.length < 2) throw new StoreRefused("invalid");
			if (rows.length > MAX_SERIES) throw new StoreRefused("too_many");
			const made: AppointmentRow[] = [];
			const conflicts: SeriesConflictRow[] = [];
			const undo = async (): Promise<void> => {
				for (const row of made) await drop(app, row.id);
			};
			try {
				for (const [index, row] of rows.entries()) {
					try {
						made.push(await appointments.insert({ ...row, app, seriesId: first.id }));
					} catch (error) {
						if (!(error instanceof StoreRefused) || STOPS.has(error.reason)) throw error;
						conflicts.push(conflictOf(index, row, error));
					}
				}
			} catch (error) {
				await undo();
				throw error;
			}
			if (conflicts.length > 0) {
				await undo();
				throw new StoreRefused("conflicts", { conflicts });
			}
			return made;
		},

		async replace(app, rows) {
			const before: AppointmentRow[] = [];
			for (const row of rows) {
				const held = await appointments.get(app, row.id);
				if (held === undefined) throw new StoreRefused("not_found");
				before.push(held);
			}
			const cancels = rows.filter((r) => r.status === "cancelled").length;
			if (cancels !== 0 && cancels !== rows.length) throw new StoreRefused("invalid");
			const done: AppointmentRow[] = [];
			const conflicts: SeriesConflictRow[] = [];
			const undo = async (): Promise<void> => {
				for (const row of done) await put(row);
			};
			try {
				for (const [index, row] of rows.entries()) {
					try {
						await appointments.replace({ ...row, app });
						const held = before[index];
						if (held !== undefined) done.push(held);
					} catch (error) {
						if (!(error instanceof StoreRefused) || STOPS.has(error.reason)) throw error;
						conflicts.push(conflictOf(index, row, error));
					}
				}
			} catch (error) {
				await undo();
				throw error;
			}
			if (conflicts.length > 0) {
				await undo();
				throw new StoreRefused("conflicts", { conflicts });
			}
		},

		async list(app, seriesId) {
			return (await appointments.list(app, { eq: { seriesId } }))
				.filter((a) => a.deletedAt === undefined)
				.sort((a, b) => a.start - b.start);
		},
	};
}
