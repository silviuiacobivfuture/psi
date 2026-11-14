import { nameKey, type RoomsSeed } from "@psi/scheduling/clinic";
import type { PersonRow, RoomRow } from "@psi/scheduling-api/store-types";

/** What becomes of one of the owner's rooms. */
export type RoomStep =
	/** A room of the store is this one (by its name, or a name it had in the old system): kept, its facts set. */
	| { kind: "keep" | "update"; seedId: string; before: RoomRow; next: RoomRow }
	/** No room of the store is this one: made. */
	| { kind: "create"; seedId: string; next: RoomRow };

/** What becomes of a room of the store that is none of the owner's rooms. */
export type LeftStep =
	/** Named a legacy room in the seed: kept for its appointments, off the plan and out of booking. */
	| { kind: "retire" | "retired"; before: RoomRow; next: RoomRow }
	/** Neither the owner's nor a legacy one (made in the console): left as it is. */
	| { kind: "untouched"; before: RoomRow };

export interface RoomsPlan {
	steps: RoomStep[];
	left: LeftStep[];
}

/** Refused before anything is written: the store does not say plainly which room is which. */
export class RoomsPlanRefused extends Error {
	override readonly name = "RoomsPlanRefused";
}

const FACTS = [
	"name",
	"kind",
	"floor",
	"purpose",
	"homePractitionerId",
	"active",
	"bookable",
] as const;
const same = (a: RoomRow, b: RoomRow): boolean => FACTS.every((k) => a[k] === b[k]);

/** The practitioner whose room it is, by name (diacritics and case ignored); none when the team has no such person. */
export function homeOf(
	people: ReadonlyArray<PersonRow>,
	name: string | null,
): PersonRow | undefined {
	if (name === null) return undefined;
	const found = people.filter((p) => nameKey(p.displayName) === nameKey(name));
	if (found.length > 1) throw new RoomsPlanRefused(`two people are named ${name}`);
	return found[0];
}

/**
 * Which stored room each of the owner's rooms is, and what it becomes. A stored room is one of the owner's by its name
 * first, then by a name it had in the old system, so a second run finds the renamed room by its new name. Each stored
 * room is one room at most, and a seed room matched by two stored rooms is refused: nothing is guessed. A matched room
 * keeps its id, and so every appointment booked in it keeps its room.
 */
export function planRooms(
	seed: RoomsSeed,
	rooms: ReadonlyArray<RoomRow>,
	people: ReadonlyArray<PersonRow>,
	now: number,
): RoomsPlan {
	const app = seed.app;
	const taken = new Set<string>();
	const steps: RoomStep[] = [];
	const byKey = (key: string): RoomRow[] =>
		rooms.filter((r) => !taken.has(r.id) && nameKey(r.name) === key);
	for (const floor of seed.floors)
		for (const room of floor.rooms) {
			const byName = byKey(nameKey(room.name));
			const byFormer = room.formerly.flatMap((n) => byKey(nameKey(n)));
			const found = byName.length > 0 ? byName : byFormer;
			if (found.length > 1)
				throw new RoomsPlanRefused(
					`${found.length} rooms of the store could be ${room.name}: ${found.map((r) => r.name).join(", ")}`,
				);
			const home = homeOf(people, room.homePractitioner);
			const facts = {
				name: room.name,
				kind: room.category,
				floor: floor.name,
				purpose: room.purpose,
				active: true,
			};
			const before = found[0];
			if (before === undefined) {
				steps.push({
					kind: "create",
					seedId: room.id,
					next: {
						id: "",
						app,
						...facts,
						...(home === undefined ? {} : { homePractitionerId: home.id }),
						createdAt: now,
						updatedAt: now,
					},
				});
				continue;
			}
			taken.add(before.id);
			const { homePractitionerId: _was, bookable: _bookable, ...rest } = before;
			const next: RoomRow = {
				...rest,
				...facts,
				...(home === undefined ? {} : { homePractitionerId: home.id }),
				updatedAt: now,
			};
			steps.push(
				same(before, next)
					? { kind: "keep", seedId: room.id, before, next: before }
					: { kind: "update", seedId: room.id, before, next },
			);
		}
	const legacy = new Set(seed.legacy.map(nameKey));
	const left = rooms
		.filter((r) => !taken.has(r.id))
		.map((before): LeftStep => {
			if (!legacy.has(nameKey(before.name))) return { kind: "untouched", before };
			const { floor: _floor, ...rest } = before;
			const next: RoomRow = { ...rest, active: false, bookable: false, updatedAt: now };
			return same(before, next)
				? { kind: "retired", before, next: before }
				: { kind: "retire", before, next };
		});
	return { steps, left };
}
