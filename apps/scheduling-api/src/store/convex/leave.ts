import { z } from "zod";
import { currentActor } from "../actor";
import { type Collection, type LeaveRow, StoreRefused } from "../types";
import { personApiId, personRef, toApiId } from "./ids";
import { isNotFound, matches } from "./recordSupport";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * Leave requests over apiRecordsExtra (a request with its decision; the roster days follow when it is approved, which
 * is the handler's job). Only the decision changes after a request is made: the dates, the kind and the person are the
 * request, and a store that is asked to change them refuses.
 */
const Leave = z.object({
	id: z.string(),
	person: z.object({ kind: z.enum(["practitioner", "staff"]), id: z.string() }),
	from: z.string(),
	to: z.string(),
	kind: z.enum(["co", "cm"]),
	status: z.enum(["pending", "approved", "rejected"]),
	decidedBy: z.string().optional(),
	createdAt: z.number(),
	updatedAt: z.number(),
});
const Leaves = answer({ leaves: z.array(Leave) });
const Saved = answer({ id: z.string() });
const Done = answer({});

const rowOf = (app: string, l: z.infer<typeof Leave>): LeaveRow => ({
	id: toApiId(l.id),
	app,
	personId: personApiId(l.person.kind, l.person.id),
	from: l.from,
	to: l.to,
	kind: l.kind,
	status: l.status,
	...(l.decidedBy === undefined ? {} : { decidedBy: l.decidedBy }),
	createdAt: l.createdAt,
	updatedAt: l.updatedAt,
});

export function leaveCollection(rpc: Rpc): Collection<LeaveRow> {
	const actor = () => ({ subject: currentActor() });
	const all = async (app: string, leave?: string) =>
		unwrap(
			await rpc.query(
				"apiLeaveExtra:leaves",
				{ tenant: app, ...(leave === undefined ? {} : { leave }) },
				Leaves,
			),
		).leaves.map((l) => rowOf(app, l));
	const decide = async (row: LeaveRow, decision: "approved" | "rejected"): Promise<void> => {
		unwrap(
			await rpc.mutation(
				"apiLeaveExtra:decideLeave",
				{ tenant: row.app, actor: actor(), leave: row.id, decision },
				Done,
			),
		);
	};
	return {
		async get(app, id) {
			return (await all(app, id))[0];
		},
		async list(app, query) {
			return (await all(app)).filter((r) => matches(r, query));
		},
		async insert(row) {
			const who = personRef(row.personId);
			if (who === undefined) throw new StoreRefused("unknown_person");
			const made = unwrap(
				await rpc.mutation(
					"apiLeaveExtra:createLeave",
					{
						tenant: row.app,
						actor: actor(),
						person: who,
						from: row.from,
						to: row.to,
						kind: row.kind,
					},
					Saved,
				),
			);
			const saved = (await all(row.app, made.id))[0];
			if (saved === undefined) throw new StoreRefused("not_found");
			if (row.status === "pending") return saved;
			await decide(saved, row.status);
			return { ...saved, status: row.status, decidedBy: currentActor() };
		},
		async replace(row) {
			const held = (await all(row.app, row.id))[0];
			if (held === undefined) return false;
			if (
				held.personId !== row.personId ||
				held.from !== row.from ||
				held.to !== row.to ||
				held.kind !== row.kind
			)
				throw new StoreRefused("invalid");
			if (held.status !== row.status) {
				if (row.status === "pending") throw new StoreRefused("not_allowed");
				await decide(held, row.status);
			}
			return true;
		},
		async remove(app, id) {
			try {
				unwrap(
					await rpc.mutation(
						"apiLeaveExtra:removeLeave",
						{ tenant: app, actor: actor(), leave: id },
						Done,
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
