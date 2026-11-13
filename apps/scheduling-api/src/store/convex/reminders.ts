import { z } from "zod";
import { currentActor } from "../actor";
import { type Collection, type ReminderRow, StoreRefused } from "../types";
import { answer, Refusal, type Rpc, unwrap } from "./rpc";
import { VisitView, type VisitViewT } from "./visit-rows";

const One = z.union([answer({ visit: VisitView }), Refusal]);
const Many = z.union([answer({ visits: z.array(VisitView) }), Refusal]);
const Done = z.union([z.object({ ok: z.literal(true) }).passthrough(), Refusal]);

type State = ReminderRow["state"];

/** What the visit's two flags say. A visit nobody has marked has no reminder row, as in the memory adapter. */
function stateOf(v: VisitViewT): State | undefined {
	if (v.deletedAt !== undefined) return undefined;
	if (v.clientConfirmed) return "confirmed";
	return v.reminderSent ? "sent" : undefined;
}

const FLAGS: Record<State, { reminderSent: boolean; clientConfirmed: boolean }> = {
	pending: { reminderSent: false, clientConfirmed: false },
	sent: { reminderSent: true, clientConfirmed: false },
	confirmed: { reminderSent: true, clientConfirmed: true },
};

/**
 * Reminder state per appointment is the visit's own `reminderSent` / `clientConfirmed` (the same flags the visitor's
 * confirm link will set). A row exists once someone marked the appointment; `updatedAt` is the visit's last change.
 */
export function reminderCollection(rpc: Rpc): Collection<ReminderRow> {
	const toRow = (app: string, v: VisitViewT): ReminderRow | undefined => {
		const state = stateOf(v);
		return state === undefined ? undefined : { id: v.id, app, state, updatedAt: v.updatedAt };
	};
	async function write(app: string, id: string, state: State): Promise<void> {
		unwrap(
			await rpc.mutation(
				"apiVisits:update",
				{ tenant: app, actor: { subject: currentActor() }, visit: id, patch: FLAGS[state] },
				Done,
			),
		);
	}
	const collection: Collection<ReminderRow> = {
		async get(app, id) {
			const out = await rpc.query("apiVisits:get", { tenant: app, visit: id }, One);
			if (!out.ok) {
				if (out.reason === "not_found") return undefined;
				throw new StoreRefused(out.reason);
			}
			return toRow(app, out.visit);
		},
		async list(app, query) {
			const out = unwrap(
				await rpc.query("apiMoneyExtra:searchVisits", { tenant: app, reminded: true }, Many),
			);
			return out.visits
				.flatMap((v) => toRow(app, v) ?? [])
				.filter((row) => query?.eq?.state === undefined || row.state === query.eq.state);
		},
		async insert(row) {
			await write(row.app, row.id, row.state);
			const saved = await collection.get(row.app, row.id);
			return saved ?? { ...row, state: row.state };
		},
		async replace(row) {
			const out = await rpc.query("apiVisits:get", { tenant: row.app, visit: row.id }, One);
			if (!out.ok) return false;
			await write(row.app, row.id, row.state);
			return true;
		},
		async remove(app, id) {
			const out = await rpc.query("apiVisits:get", { tenant: app, visit: id }, One);
			if (!out.ok || stateOf(out.visit) === undefined) return false;
			await write(app, id, "pending");
			return true;
		},
	};
	return collection;
}
