import {
	type DayException,
	entryRows,
	oneOffProblems,
	type WeeklyRule,
	weeklyPlanProblems,
} from "@psi/scheduling/domain";
import type { AvailabilityPort, StoredClosure, StoredException } from "./availability-port";
import { newId } from "./ids";
import { type Collection, type PersonRow, type RoomRow, StoreRefused } from "./types";

/**
 * Memory mode's seed: a practitioner nobody has given hours yet works Monday to Friday, 09:00-17:00, both modes (the
 * Convex store holds each practitioner's real rules, seeded or imported). Once a set is saved it is that set.
 */
export const MEMORY_SEED_WEEK: ReadonlyArray<WeeklyRule> = [1, 2, 3, 4, 5].map((weekday) => ({
	weekday,
	start: 540,
	end: 1020,
	modes: ["onsite", "online"],
}));

const MAX_BULK = 50;

/** The in-memory availability store: the same checks, refusals and all-or-nothing writes as the Convex wrapper. */
export function createMemoryAvailability(c: {
	people: Collection<PersonRow>;
	rooms: Collection<RoomRow>;
}): {
	port: AvailabilityPort;
	/** What the slot logic reads for one practitioner (the memory visitor). */
	of(
		app: string,
		personId: string,
	): { rules: ReadonlyArray<WeeklyRule>; exceptions: ReadonlyArray<DayException> };
	state: () => unknown;
} {
	const rules = new Map<string, WeeklyRule[]>();
	const exceptions = new Map<string, StoredException[]>();
	const closures = new Map<string, StoredClosure[]>();
	const at = (app: string, id: string): string => `${app}\u0000${id}`;

	async function practitioners(app: string, ids: ReadonlyArray<string>): Promise<void> {
		if (ids.length === 0 || ids.length > MAX_BULK || new Set(ids).size !== ids.length)
			throw new StoreRefused("not_found");
		for (const id of ids) {
			const person = await c.people.get(app, id);
			if (person === undefined || person.kind !== "practitioner")
				throw new StoreRefused("not_found");
		}
	}
	const rulesOf = (app: string, id: string): WeeklyRule[] => [
		...(rules.get(at(app, id)) ?? MEMORY_SEED_WEEK),
	];
	const daysOf = (app: string, id: string): StoredException[] => exceptions.get(at(app, id)) ?? [];

	const port: AvailabilityPort = {
		async get(app, personId, fromDate) {
			const person = await c.people.get(app, personId);
			if (person === undefined || person.kind !== "practitioner") return undefined;
			return {
				rules: rulesOf(app, personId).sort(
					(a, b) => a.weekday - b.weekday || a.start - b.start || a.end - b.end,
				),
				exceptions: daysOf(app, personId)
					.filter((e) => e.date >= fromDate)
					.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0)),
			};
		},
		async replaceRules(app, sets) {
			await practitioners(
				app,
				sets.map((s) => s.personId),
			);
			if (sets.some((s) => weeklyPlanProblems(s.rules).length > 0))
				throw new StoreRefused("invalid");
			for (const set of sets)
				rules.set(
					at(app, set.personId),
					set.rules.map((r) => ({ ...r, modes: [...new Set(r.modes)] })),
				);
		},
		async addOneOff(app, personIds, entry, timeZone) {
			await practitioners(app, personIds);
			for (const id of personIds)
				if (oneOffProblems(entry, daysOf(app, id), timeZone).length > 0)
					throw new StoreRefused("invalid");
			const rows = entryRows(entry);
			for (const id of personIds)
				exceptions.set(at(app, id), [
					...daysOf(app, id),
					...rows.map((row) => ({ ...row, id: newId("x") })),
				]);
			return rows.length;
		},
		async removeOneOff(app, personId, id) {
			const held = daysOf(app, personId);
			if (!held.some((e) => e.id === id)) return false;
			exceptions.set(
				at(app, personId),
				held.filter((e) => e.id !== id),
			);
			return true;
		},
		async closures(app, roomId, fromDate) {
			if ((await c.rooms.get(app, roomId)) === undefined) return undefined;
			return (closures.get(at(app, roomId)) ?? [])
				.filter((x) => x.date >= fromDate)
				.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0));
		},
		async addClosure(app, roomId, closure) {
			if ((await c.rooms.get(app, roomId)) === undefined) throw new StoreRefused("not_found");
			const entry = {
				from: closure.from,
				until: closure.until,
				kind: "closed" as const,
				...(closure.start === undefined ? {} : { start: closure.start }),
				...(closure.end === undefined ? {} : { end: closure.end }),
			};
			// The shape only, as the Convex wrapper checks it (UTC has no skipped hour).
			if (oneOffProblems(entry, [], "UTC").length > 0) throw new StoreRefused("invalid");
			const rows = entryRows(entry);
			const held = closures.get(at(app, roomId)) ?? [];
			const fresh = rows.filter(
				(r) => !held.some((h) => h.date === r.date && h.start === r.start && h.end === r.end),
			);
			closures.set(at(app, roomId), [
				...held,
				...fresh.map((r) => ({
					id: newId("k"),
					date: r.date,
					...(r.start === undefined ? {} : { start: r.start }),
					...(r.end === undefined ? {} : { end: r.end }),
				})),
			]);
		},
		async removeClosure(app, roomId, id) {
			const held = closures.get(at(app, roomId)) ?? [];
			if (!held.some((x) => x.id === id)) return false;
			closures.set(
				at(app, roomId),
				held.filter((x) => x.id !== id),
			);
			return true;
		},
	};
	return {
		port,
		of: (app, personId) => ({ rules: rulesOf(app, personId), exceptions: daysOf(app, personId) }),
		state: () => [[...rules.entries()], [...exceptions.entries()], [...closures.entries()]],
	};
}
