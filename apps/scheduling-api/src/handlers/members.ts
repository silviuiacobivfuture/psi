import { CATALOGUE, parseRelation } from "../authz/catalogue";
import { personalGrant } from "../authz/links";
import { memberTuples } from "../authz/tuples";
import type { HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { MemberRow } from "../store/types";
import { syncMember } from "./directory";
import { catalogueMatrix } from "./matrix";
import { diff, must, paginate, removeTuplesThenRow, replaced, writeRowThenTuples } from "./shared";

/** A member as the wire carries them: the grants and denials stay the editor's own read. */
function memberOut(m: MemberRow) {
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
const listed = (ids: readonly string[]): string => [...ids].sort().join(",");

/** The journal's `changes`: only what moved, in the `{ field: { from, to } }` shape the console reads. */
function changesOf(
	pairs: Readonly<Record<string, { from: string; to: string }>>,
): Record<string, { from: string; to: string }> {
	return Object.fromEntries(Object.entries(pairs).filter(([, v]) => v.from !== v.to));
}

export const memberHandlers: HandlersOf<
	"members.list" | "members.get" | "members.put" | "members.remove" | "members.overrides"
> = {
	async "members.list"(ctx) {
		const rows = (await ctx.deps.store.c.members.list(ctx.app)).sort((a, b) =>
			a.displayName.localeCompare(b.displayName),
		);
		const page = paginate(rows, ctx.query.limit, ctx.query.cursor);
		return { ...page, items: page.items.map(memberOut) };
	},

	async "members.get"(ctx) {
		const subject = String(ctx.params.subject);
		const held = await must(ctx.deps.store.c.members, ctx.app, subject, "member");
		const [people, effective] = await Promise.all([
			ctx.deps.store.c.people.list(ctx.app),
			ctx.deps.access.scopesHeldMany(
				subject,
				ctx.app,
				CATALOGUE.map((def) => def.key),
			),
		]);
		return {
			...memberOut(held),
			grant: held.grants,
			deny: held.denies,
			calendars: people.filter((p) => p.subject === subject).map((p) => p.id),
			taken: people
				.filter((p) => p.subject !== undefined && p.subject !== subject)
				.map((p) => p.id),
			matrix: catalogueMatrix((def) => effective.get(def.key) ?? []),
		};
	},

	async "members.put"(ctx) {
		const subject = String(ctx.params.subject);
		if (subject === ctx.subject)
			throw forbidden("nobody changes their own roles", { reason: "self" });
		const roles = await ctx.deps.store.c.roles.list(ctx.app);
		for (const r of ctx.body.roles)
			if (!roles.some((x) => x.id === r)) throw fail("invalid", "unknown role", { role: r });
		const people = await ctx.deps.store.c.people.list(ctx.app);
		for (const p of ctx.body.coordinates)
			if (!people.some((x) => x.id === p)) throw fail("invalid", "unknown person", { person: p });
		const held = await ctx.deps.store.c.members.get(ctx.app, subject);
		if (held === undefined && !(await ctx.canAll("members_create")))
			throw forbidden("the role does not allow this", { permission: "members_create" });
		const next: MemberRow = {
			id: subject,
			app: ctx.app,
			subject,
			displayName: ctx.body.displayName,
			...(ctx.body.email === undefined ? {} : { email: ctx.body.email }),
			roles: [...new Set(ctx.body.roles)],
			coordinates: [...new Set(ctx.body.coordinates)],
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
		await syncMember(ctx, ctx.app, subject, held, next);
		ctx.note({
			roles: next.roles,
			created: held === undefined,
			changes: changesOf({
				displayName: { from: held?.displayName ?? "", to: next.displayName },
				roles: { from: listed(held?.roles ?? []), to: listed(next.roles) },
				coordinates: { from: listed(held?.coordinates ?? []), to: listed(next.coordinates) },
			}),
		});
		return memberOut(next);
	},

	async "members.remove"(ctx) {
		const subject = String(ctx.params.subject);
		if (subject === ctx.subject) throw forbidden("nobody removes themselves", { reason: "self" });
		const held = await must(ctx.deps.store.c.members, ctx.app, subject, "member");
		await removeTuplesThenRow(ctx, {
			tuples: memberTuples(held),
			remove: async () => {
				await ctx.deps.store.c.members.remove(ctx.app, subject);
			},
		});
		await syncMember(ctx, ctx.app, subject, held, undefined);
		// The journal names someone who is gone from what it kept: their name and the roles they held.
		ctx.note({
			changes: changesOf({
				displayName: { from: held.displayName, to: "" },
				roles: { from: listed(held.roles), to: "" },
			}),
		});
		return { ok: true as const };
	},

	async "members.overrides"(ctx) {
		const subject = String(ctx.params.subject);
		if (subject === ctx.subject)
			throw forbidden("nobody changes their own grants", { reason: "self" });
		const held = await must(ctx.deps.store.c.members, ctx.app, subject, "member");
		for (const g of ctx.body.grant)
			if (parseRelation(g) === undefined)
				throw fail("invalid", "not a permission relation", { relation: g });
		for (const d of ctx.body.deny)
			if (parseRelation(d) === undefined) throw fail("invalid", "not a permission key", { key: d });
		const next: MemberRow = {
			...held,
			grants: [...new Set(ctx.body.grant)].sort(),
			denies: [...new Set(ctx.body.deny)].sort(),
			updatedAt: ctx.now,
		};
		const change = diff(
			held.grants.map((g) => personalGrant(ctx.app, subject, g)),
			next.grants.map((g) => personalGrant(ctx.app, subject, g)),
		);
		await writeRowThenTuples(ctx, {
			write: async () => replaced(ctx.deps.store.c.members, next),
			undo: async () => {
				await ctx.deps.store.c.members.replace(held);
			},
			tuples: () => change,
		});
		ctx.note({
			grants: next.grants.length,
			denies: next.denies.length,
			// Both lists, changed or not: the journal's sentence counts what the person holds individually now.
			changes: {
				grants: { from: listed(held.grants), to: listed(next.grants) },
				denies: { from: listed(held.denies), to: listed(next.denies) },
			},
		});
		return { grant: next.grants, deny: next.denies };
	},
};
