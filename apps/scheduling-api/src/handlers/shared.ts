import type { RouteSpec, SchedType } from "@psi/scheduling-sdk/contract";
import type { Tuple } from "../authz/port";
import type { Ctx } from "../http/context";
import { fail, notFound } from "../http/errors";
import { newId } from "../store/ids";
import type { Collection } from "../store/types";

export { newId, notFound };

/** An offset cursor, opaque to the caller. The Convex adapter will hand out its own. */
export function paginate<T>(
	items: readonly T[],
	limit: number | undefined,
	cursor: string | undefined,
): { items: T[]; nextCursor?: string } {
	const size = limit ?? 100;
	const start =
		cursor === undefined
			? 0
			: Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
	if (!Number.isInteger(start) || start < 0) throw fail("invalid", "bad cursor");
	const page = items.slice(start, start + size);
	return start + size < items.length
		? { items: page, nextCursor: Buffer.from(String(start + size)).toString("base64url") }
		: { items: page };
}

export async function must<R extends { id: string; app: string }>(
	collection: Collection<R>,
	app: string,
	id: string,
	what: string,
): Promise<R> {
	const row = await collection.get(app, id);
	if (row === undefined) throw notFound(what);
	return row;
}

export const stamps = (now: number): { createdAt: number; updatedAt: number } => ({
	createdAt: now,
	updatedAt: now,
});

/** Writes tuples the handler's change needs, after the store write; a failure is surfaced (fail closed), never swallowed. */
export async function writeTuples(
	ctx: Ctx<RouteSpec>,
	writes: readonly Tuple[],
	deletes: readonly Tuple[] = [],
): Promise<void> {
	if (writes.length === 0 && deletes.length === 0) return;
	await ctx.deps.authz.write({ writes, deletes });
}

/** The tuples to add and to remove when a set of wanted facts replaces the facts held. */
export function diff(
	held: readonly Tuple[],
	wanted: readonly Tuple[],
): { writes: Tuple[]; deletes: Tuple[] } {
	const key = (t: Tuple): string => `${t.user}|${t.relation}|${t.object}`;
	const have = new Set(held.map(key));
	const want = new Set(wanted.map(key));
	return {
		writes: wanted.filter((t) => !have.has(key(t))),
		deletes: held.filter((t) => !want.has(key(t))),
	};
}

export type { SchedType };

/** `YYYY-MM-DD` plus days, in UTC calendar arithmetic. */
export function addDaysKey(date: string, days: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * One operation across the store and the tuples (a role, a member): the row is written, then its tuples; when the
 * tuples fail, the row is put back and the failure is reported. A row without its tuples would be a role nobody
 * holds, or worse a member who cannot be refused.
 */
export async function writeRowThenTuples<T>(
	ctx: Ctx<RouteSpec>,
	step: {
		write: () => Promise<T>;
		undo: (saved: T) => Promise<void>;
		tuples: (saved: T) => { writes: readonly Tuple[]; deletes: readonly Tuple[] };
	},
): Promise<T> {
	const saved = await step.write();
	const { writes, deletes } = step.tuples(saved);
	try {
		await writeTuples(ctx, writes, deletes);
	} catch (error) {
		await step
			.undo(saved)
			.catch(() =>
				ctx.deps.log({ level: "error", event: "rollback_failed", requestId: ctx.requestId }),
			);
		throw error;
	}
	return saved;
}

/** The mirror for a removal: the tuples go first, then the row; when the row cannot go, the tuples come back. */
export async function removeTuplesThenRow(
	ctx: Ctx<RouteSpec>,
	step: { tuples: readonly Tuple[]; remove: () => Promise<void> },
): Promise<void> {
	await writeTuples(ctx, [], step.tuples);
	try {
		await step.remove();
	} catch (error) {
		await writeTuples(ctx, step.tuples).catch(() =>
			ctx.deps.log({ level: "error", event: "rollback_failed", requestId: ctx.requestId }),
		);
		throw error;
	}
}

/** Replaces a row and hands it back, for the places a write is the value of an expression. */
export async function replaced<R extends { id: string; app: string }>(
	collection: Collection<R>,
	row: R,
): Promise<R> {
	await collection.replace(row);
	return row;
}
