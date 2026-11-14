import { z } from "zod";
import { currentActor } from "../actor";
import type { AvailabilityPort } from "../availability-port";
import { StoreRefused } from "../types";
import { personRef, toApiId, toConvexId } from "./ids";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * The availability editor over `apiAvailability` (rules and one-off days, all-or-nothing in one mutation each) and the
 * rooms' closures over `staffRooms` (a range is one mutation there too). A person is a practitioner here when their
 * people id is `p` + a practitioner's Convex id; anyone else has no availability (`not_found`).
 */
const FN = "apiAvailability";
const Mode = z.enum(["onsite", "online"]);
const Rule = z.object({
	weekday: z.number(),
	start: z.number(),
	end: z.number(),
	modes: z.array(Mode),
	validFrom: z.string().optional(),
	validUntil: z.string().optional(),
	week: z.enum(["A", "B"]).optional(),
	override: z.boolean().optional(),
});
const Exception = z.object({
	id: z.string(),
	date: z.string(),
	kind: z.enum(["closed", "open"]),
	start: z.number().optional(),
	end: z.number().optional(),
	modes: z.array(Mode).optional(),
});
const Closure = z.object({
	id: z.string(),
	date: z.string(),
	start: z.number().optional(),
	end: z.number().optional(),
});
const Got = answer({
	abAnchor: z.string().optional(),
	rules: z.array(Rule),
	exceptions: z.array(Exception),
});
const Done = answer({});
const Added = answer({ added: z.number() });
const Closures = answer({ closures: z.array(Closure) });

/** A people id as a practitioner's Convex id, or undefined (staff, or not an id at all). */
export function practitionerConvexId(personId: string): string | undefined {
	const ref = personRef(personId);
	return ref?.kind === "practitioner" ? ref.id : undefined;
}

function practitionersOrRefuse(personIds: ReadonlyArray<string>): string[] {
	const ids = personIds.map(practitionerConvexId);
	const known = ids.filter((id) => id !== undefined);
	if (known.length !== ids.length) throw new StoreRefused("not_found");
	return known;
}

const isNotFound = (e: unknown): boolean => e instanceof StoreRefused && e.reason === "not_found";

export function availabilityPort(rpc: Rpc): AvailabilityPort {
	const actor = () => ({ subject: currentActor() });
	const closures: AvailabilityPort["closures"] = async (app, roomId, fromDate) => {
		const room = toConvexId(roomId);
		if (room === undefined) return undefined;
		try {
			const out = unwrap(
				await rpc.query(`${FN}:roomClosures`, { tenant: app, room, fromDate }, Closures),
			);
			return out.closures.map((c) => ({ ...c, id: toApiId(c.id) }));
		} catch (e) {
			if (isNotFound(e)) return undefined;
			throw e;
		}
	};
	return {
		async get(app, personId, fromDate) {
			const practitioner = practitionerConvexId(personId);
			if (practitioner === undefined) return undefined;
			try {
				const out = unwrap(
					await rpc.query(`${FN}:get`, { tenant: app, practitioner, fromDate }, Got),
				);
				return {
					rules: out.rules,
					exceptions: out.exceptions.map((e) => ({ ...e, id: toApiId(e.id) })),
					...(out.abAnchor === undefined ? {} : { abAnchor: out.abAnchor }),
				};
			} catch (e) {
				if (isNotFound(e)) return undefined;
				throw e;
			}
		},
		async replaceRules(app, sets) {
			const ids = practitionersOrRefuse(sets.map((s) => s.personId));
			unwrap(
				await rpc.mutation(
					`${FN}:replaceRules`,
					{
						tenant: app,
						actor: actor(),
						sets: sets.map((s, i) => ({ practitioner: ids[i], rules: s.rules })),
					},
					answer({ counts: z.array(z.number()) }),
				),
			);
		},
		async addOneOff(app, personIds, entry, timeZone) {
			const practitioners = practitionersOrRefuse(personIds);
			return unwrap(
				await rpc.mutation(
					`${FN}:addOneOff`,
					{ tenant: app, actor: actor(), practitioners, entry, timeZone },
					Added,
				),
			).added;
		},
		async removeOneOff(app, personId, id) {
			const practitioner = practitionerConvexId(personId);
			const exception = toConvexId(id);
			if (practitioner === undefined || exception === undefined) return false;
			try {
				unwrap(
					await rpc.mutation(
						`${FN}:removeOneOff`,
						{ tenant: app, actor: actor(), practitioner, exception },
						Done,
					),
				);
				return true;
			} catch (e) {
				if (isNotFound(e)) return false;
				throw e;
			}
		},
		closures,
		async addClosure(app, roomId, closure) {
			const room = toConvexId(roomId);
			if (room === undefined) throw new StoreRefused("not_found");
			unwrap(
				await rpc.mutation(
					"staffRooms:addRoomClosure",
					{
						tenant: app,
						room,
						from: closure.from,
						to: closure.until,
						...(closure.start === undefined ? {} : { start: closure.start }),
						...(closure.end === undefined ? {} : { end: closure.end }),
						actor: actor(),
					},
					Added,
				),
			);
		},
		async removeClosure(app, roomId, id) {
			const held = await closures(app, roomId, "0000-01-01");
			if (held === undefined || !held.some((c) => c.id === id)) return false;
			unwrap(
				await rpc.mutation(
					"staffRooms:removeRoomClosure",
					{ tenant: app, closure: id, actor: actor() },
					Done,
				),
			);
			return true;
		},
	};
}
