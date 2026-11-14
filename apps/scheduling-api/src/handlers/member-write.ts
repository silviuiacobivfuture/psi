import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { memberTuples } from "../authz/tuples";
import type { Ctx } from "../http/context";
import { fail } from "../http/errors";
import type { MemberRow } from "../store/types";
import { syncMember } from "./directory";
import { diff, replaced, writeRowThenTuples } from "./shared";

type C = Ctx<RouteSpec>;

/** A member as the wire carries them: the grants and denials stay the editor's own read. */
export function memberOut(m: MemberRow) {
	return {
		subject: m.subject,
		displayName: m.displayName,
		...(m.email === undefined ? {} : { email: m.email }),
		roles: m.roles,
		coordinates: m.coordinates,
		createdAt: m.createdAt,
		updatedAt: m.updatedAt,
	};
}

/** A list of ids as the journal keeps a before/after: one text, sorted, comma-separated (empty for none). */
export const listed = (ids: readonly string[]): string => [...ids].sort().join(",");

/** The journal's `changes`: only what moved, in the `{ field: { from, to } }` shape the console reads. */
export function changesOf(
	pairs: Readonly<Record<string, { from: string; to: string }>>,
): Record<string, { from: string; to: string }> {
	return Object.fromEntries(Object.entries(pairs).filter(([, v]) => v.from !== v.to));
}

/** Every role and every coordinated person named must be the app's own: refused (400) before anything is written. */
export async function checkRefs(
	ctx: C,
	roles: readonly string[],
	coordinates: readonly string[],
): Promise<void> {
	const known = await ctx.deps.store.c.roles.list(ctx.app);
	for (const r of roles)
		if (!known.some((x) => x.id === r)) throw fail("invalid", "unknown role", { role: r });
	const people = await ctx.deps.store.c.people.list(ctx.app);
	for (const p of coordinates)
		if (!people.some((x) => x.id === p)) throw fail("invalid", "unknown person", { person: p });
}

export interface MemberInput {
	displayName: string;
	email?: string | undefined;
	roles: readonly string[];
	coordinates: readonly string[];
}

/**
 * Adds a member or changes one: the row, then the tuples it implies (undone together on a failure), then the directory
 * the notifier reads. Answers the new row and the journal's detail of it (what was added, or what moved).
 */
export async function writeMember(
	ctx: C,
	subject: string,
	held: MemberRow | undefined,
	input: MemberInput,
): Promise<{ next: MemberRow; detail: Record<string, unknown> }> {
	const next: MemberRow = {
		id: subject,
		app: ctx.app,
		subject,
		displayName: input.displayName,
		...(input.email === undefined ? {} : { email: input.email }),
		roles: [...new Set(input.roles)],
		coordinates: [...new Set(input.coordinates)],
		grants: held?.grants ?? [],
		denies: held?.denies ?? [],
		createdAt: held?.createdAt ?? ctx.now,
		updatedAt: ctx.now,
	};
	const change = diff(held === undefined ? [] : memberTuples(held), memberTuples(next));
	await writeRowThenTuples(ctx, {
		write: async () =>
			held === undefined
				? ctx.deps.store.c.members.insert(next)
				: replaced(ctx.deps.store.c.members, next),
		undo: async () => {
			if (held === undefined) await ctx.deps.store.c.members.remove(ctx.app, subject);
			else await ctx.deps.store.c.members.replace(held);
		},
		tuples: () => change,
	});
	await syncMember(ctx, ctx.app, subject, next);
	return {
		next,
		detail: {
			roles: next.roles,
			created: held === undefined,
			changes: changesOf({
				displayName: { from: held?.displayName ?? "", to: next.displayName },
				roles: { from: listed(held?.roles ?? []), to: listed(next.roles) },
				coordinates: { from: listed(held?.coordinates ?? []), to: listed(next.coordinates) },
			}),
		},
	};
}
