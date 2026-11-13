import { z } from "zod";
import { currentActor } from "../actor";
import type { RosterRow } from "../types";
import { type Collection, StoreConflict, StoreRefused } from "../types";
import { personApiId, personRef, rosterApiId, splitRosterId, toApiId } from "./ids";
import { isNotFound, matches } from "./recordSupport";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * Roster days over apiRoster. A day's API id is `<personId>_<date>` (ids.ts); Convex keeps one row per person and date
 * with a version, so `insert` and `replace` are both `setDay`. Statuses: works/annual_leave/medical_leave/free.
 * `createdAt` is the row's creation time (Convex's `_creationTime`); `updatedAt` its last write.
 */
const STATUS = {
	works: "work",
	annual_leave: "leave_co",
	medical_leave: "leave_cm",
	free: "free",
} as const;
const TO_CONVEX = {
	work: "works",
	leave_co: "annual_leave",
	leave_cm: "medical_leave",
	free: "free",
} as const;

const Day = z.object({
	id: z.string(),
	_creationTime: z.number(),
	date: z.string(),
	status: z.enum(["works", "annual_leave", "medical_leave", "free"]),
	startMinutes: z.number().optional(),
	endMinutes: z.number().optional(),
	person: z.object({ kind: z.enum(["practitioner", "staff"]), id: z.string() }),
	updatedAt: z.number(),
});
const Range = answer({ days: z.array(Day) });
const Saved = answer({ id: z.string() });
const Cleared = answer({});

/** Every day the API can ask about: well past any roster that exists. */
const FIRST = "1900-01-01";
const LAST = "2999-12-31";

function rowOf(app: string, d: z.infer<typeof Day>): RosterRow {
	const personId = personApiId(d.person.kind, d.person.id);
	return {
		id: rosterApiId(personId, d.date),
		app,
		personId,
		date: d.date,
		kind: STATUS[d.status],
		...(d.startMinutes === undefined ? {} : { start: d.startMinutes }),
		...(d.endMinutes === undefined ? {} : { end: d.endMinutes }),
		createdAt: Math.floor(d._creationTime),
		updatedAt: d.updatedAt,
	};
}

export function rosterCollection(rpc: Rpc): Collection<RosterRow> {
	const days = async (app: string, from: string, to: string) =>
		unwrap(await rpc.query("apiRoster:range", { tenant: app, from, to }, Range)).days;
	const write = async (row: RosterRow): Promise<void> => {
		const who = personRef(row.personId);
		if (who === undefined) throw new StoreRefused("unknown_person");
		unwrap(
			await rpc.mutation(
				"apiRoster:setDay",
				{
					tenant: row.app,
					actor: { subject: currentActor() },
					person: who,
					date: row.date,
					status: TO_CONVEX[row.kind],
					...(row.start === undefined ? {} : { startMinutes: row.start }),
					...(row.end === undefined ? {} : { endMinutes: row.end }),
				},
				Saved,
			),
		);
	};
	const find = async (app: string, id: string) => {
		const split = splitRosterId(id);
		if (split === undefined) return undefined;
		return (await days(app, split.date, split.date)).find(
			(d) => rosterApiId(personApiId(d.person.kind, d.person.id), d.date) === id,
		);
	};
	const get = async (app: string, id: string): Promise<RosterRow | undefined> => {
		const day = await find(app, id);
		return day === undefined ? undefined : rowOf(app, day);
	};
	return {
		get,
		async list(app, query) {
			const eq = query?.eq;
			const from = typeof eq?.date === "string" ? eq.date : FIRST;
			const to = typeof eq?.date === "string" ? eq.date : LAST;
			return (await days(app, from, to)).map((d) => rowOf(app, d)).filter((r) => matches(r, query));
		},
		async insert(row) {
			if ((await get(row.app, rosterApiId(row.personId, row.date))) !== undefined)
				throw new StoreConflict(`${row.id} exists`);
			await write(row);
			const saved = await get(row.app, rosterApiId(row.personId, row.date));
			if (saved === undefined) throw new StoreRefused("not_found");
			return saved;
		},
		async replace(row) {
			if ((await get(row.app, row.id)) === undefined) return false;
			await write(row);
			return true;
		},
		async remove(app, id) {
			const day = await find(app, id);
			if (day === undefined) return false;
			try {
				unwrap(
					await rpc.mutation(
						"apiRoster:clearDay",
						{ tenant: app, actor: { subject: currentActor() }, day: toApiId(day.id) },
						Cleared,
					),
				);
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		},
	};
}
