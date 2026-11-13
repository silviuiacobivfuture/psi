import { type RoomsSeed, roomsPlanDocument } from "@psi/scheduling/clinic";
import type { SchedulingClient } from "@psi/scheduling-sdk";
import { drain } from "../port/sdk/map";

export interface ApplyReport {
	created: string[];
	updated: string[];
	kept: string[];
	planSaved: boolean;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** JSON with every object's keys in order, so two documents that say the same thing compare equal. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (typeof value === "object" && value !== null)
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

/**
 * Puts a clinic's rooms and floor plan into the scheduling service from a rooms seed, through its own `rooms` and
 * `floor-plan` routes: a room that exists by name is kept (its category made right), a missing one is created, and the
 * plan is saved from the stored revision with every room linked to its stored id. Running it again changes nothing.
 * `dryRun` reports what it would do and writes nothing.
 */
export async function applyRooms(
	api: SchedulingClient,
	app: string,
	seed: RoomsSeed,
	dryRun = false,
): Promise<ApplyReport> {
	const report: ApplyReport = { created: [], updated: [], kept: [], planSaved: false };
	const existing = await drain((cursor) =>
		api.rooms.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
	);
	const people = await drain((cursor) =>
		api.people.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
	);
	const ids = new Map<string, string>();
	for (const floor of seed.floors) {
		for (const room of floor.rooms) {
			// What the service keeps about the room: its category, floor, purpose and, when the practitioner is on the team, whose it is.
			const home =
				room.homePractitioner === null
					? undefined
					: people.find((p) => norm(p.displayName) === norm(room.homePractitioner ?? ""))?.id;
			const facts = {
				kind: room.category,
				floor: floor.name,
				purpose: room.purpose,
				...(home === undefined ? {} : { homePractitionerId: home }),
			};
			const found = existing.find((r) => norm(r.name) === norm(room.name));
			if (found === undefined) {
				report.created.push(room.name);
				ids.set(
					room.id,
					dryRun
						? `pending-${room.id}`
						: (await api.rooms.create({ app, name: room.name, ...facts })).id,
				);
				continue;
			}
			ids.set(room.id, found.id);
			const same =
				found.kind === facts.kind &&
				found.floor === facts.floor &&
				found.purpose === facts.purpose &&
				found.homePractitionerId === facts.homePractitionerId;
			if (same) report.kept.push(room.name);
			else {
				report.updated.push(room.name);
				if (!dryRun) await api.rooms.update({ app, id: found.id, ...facts });
			}
		}
	}
	const stored = await api.floorPlan.get({ app });
	const doc = roomsPlanDocument(seed, (seedId) => ids.get(seedId) ?? seedId, stored.revision);
	const same =
		stored.doc !== undefined &&
		canonical({ ...stored.doc, revision: 0 }) === canonical({ ...doc, revision: 0 });
	if (!same && !dryRun) {
		await api.floorPlan.put({ app, doc });
	}
	report.planSaved = !same;
	return report;
}
