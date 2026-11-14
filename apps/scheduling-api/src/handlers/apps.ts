import {
	allAppRelations,
	appRelation,
	CATALOGUE,
	parseRelation,
	permissionOf,
} from "../authz/catalogue";
import { personalGrant, roleGrant } from "../authz/links";
import { labelOf } from "../authz/manifest";
import { seedRoles } from "../authz/roles-seed";
import { memberTuples, objectLinks, platformLink, roleTuples } from "../authz/tuples";
import type { Deps, HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { MemberRow, RoleRow } from "../store/types";
import { capabilitiesOf } from "./capabilities";
import { syncMember } from "./directory";
import {
	diff,
	must,
	newId,
	paginate,
	removeTuplesThenRow,
	replaced,
	stamps,
	writeRowThenTuples,
} from "./shared";

/** What the Owner role always keeps, so an app cannot lock itself out of its own roles and team. */
const GUARDED = [
	"roles_view",
	"roles_create",
	"roles_edit",
	"roles_delete",
	"members_view",
	"members_edit",
].map((key) => {
	const def = permissionOf(key);
	if (def === undefined) throw new Error(`guarded permission ${key} is not in the catalogue`);
	return appRelation(def, "all");
});

/** Creates an app with its seed roles and its first owner, and the tuples that make them real. */
export async function provisionApp(
	deps: Deps,
	input: { id: string; name: string; timeZone: string; ownerSubject: string },
) {
	const { id, name, timeZone, ownerSubject } = input;
	const now = deps.clock();
	const s = deps.store.c;
	await s.apps.insert({ id, app: id, name, timeZone, status: "active", ...stamps(now) });
	try {
		await seedAppAccess(deps, id, ownerSubject);
	} catch (error) {
		await s.apps.remove(id, id).catch(() => undefined);
		throw error;
	}
	return { id, name, timeZone, status: "active" as const, createdAt: now, updatedAt: now };
}

/**
 * Gives an app that exists in the store its seed roles and its first owner (each only when missing) and writes the
 * tuples of every role and member the store holds. Safe to repeat: it is how an app made by an import, or a service
 * whose authorization tuples are held in memory, becomes usable. All or nothing for what it creates.
 */
export async function seedAppAccess(deps: Deps, id: string, ownerSubject: string): Promise<void> {
	const now = deps.clock();
	const s = deps.store.c;
	const made: RoleRow[] = [];
	let owner: MemberRow | undefined;
	try {
		const held = await s.roles.list(id);
		if (held.length === 0)
			for (const r of seedRoles())
				made.push(
					await s.roles.insert({
						id: `${id}-${r.slug}`,
						app: id,
						name: r.name,
						description: r.description,
						system: true,
						permissions: [...new Set(r.permissions)].sort(),
						...stamps(now),
					}),
				);
		const roles = [...held, ...made];
		if ((await s.members.get(id, ownerSubject)) === undefined) {
			const ownerRole = roles.find(isOwnerRole);
			if (ownerRole === undefined) throw new Error("the app has no Owner role");
			owner = await s.members.insert({
				id: ownerSubject,
				app: id,
				subject: ownerSubject,
				displayName: ownerSubject,
				roles: [ownerRole.id],
				coordinates: [],
				grants: [],
				denies: [],
				...stamps(now),
			});
		}
		const members = await s.members.list(id);
		await deps.authz.write({
			writes: [
				platformLink(id),
				...roles.flatMap(roleTuples),
				...members.flatMap(memberTuples),
				...(await objectLinks(deps.store, id)),
			],
			deletes: [],
		});
	} catch (error) {
		// All or nothing: a half-made app would have an owner nobody can authorize.
		if (owner !== undefined) await s.members.remove(id, owner.id).catch(() => undefined);
		for (const r of made) await s.roles.remove(id, r.id).catch(() => undefined);
		throw error;
	}
}

const OWNER_ROLE = "Owner";
const isOwnerRole = (role: RoleRow): boolean => role.system && role.name === OWNER_ROLE;

function needsOwnerKept(role: RoleRow, permissions: readonly string[]): boolean {
	return !isOwnerRole(role) || GUARDED.every((r) => permissions.includes(r));
}

export const appHandlers: HandlersOf<
	| "me.get"
	| "me.capabilities"
	| "apps.create"
	| "apps.get"
	| "apps.update"
	| "members.list"
	| "members.put"
	| "members.remove"
	| "members.overrides"
	| "roles.list"
	| "roles.create"
	| "roles.get"
	| "roles.update"
	| "roles.setPermissions"
	| "roles.remove"
> = {
	async "me.get"(ctx) {
		if (ctx.principal.kind !== "person")
			throw forbidden("service keys reach the visitor routes only");
		const mine = await ctx.deps.store.appsOf(ctx.subject);
		const apps = [];
		for (const m of mine)
			if (await ctx.deps.access.isMember(ctx.subject, m.app))
				apps.push({ app: m.app, roles: m.roles });
		return { subject: ctx.subject, kind: "person" as const, apps };
	},

	async "me.capabilities"(ctx) {
		if (ctx.principal.kind !== "person")
			throw forbidden("service keys reach the visitor routes only");
		// Seeing what a role or ANOTHER member may do is the view-as: the estate administrator's alone, never an app owner's.
		if (ctx.query.as !== undefined && !(await ctx.deps.access.isPlatformAdmin(ctx.subject)))
			throw forbidden("estate administrators only");
		return capabilitiesOf(ctx, ctx.query.as);
	},

	async "apps.create"(ctx) {
		const { id, name, timeZone, ownerSubject } = ctx.body;
		if (await ctx.deps.store.c.apps.get(id, id)) throw fail("conflict", "the app exists");
		const made = await provisionApp(ctx.deps, { id, name, timeZone, ownerSubject });
		await syncMember(ctx, id, ownerSubject, await ctx.deps.store.c.members.get(id, ownerSubject));
		return made;
	},

	async "apps.get"(ctx) {
		const row = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
		return {
			id: row.id,
			name: row.name,
			timeZone: row.timeZone,
			status: row.status,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	},

	async "apps.update"(ctx) {
		const row = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
		const next = {
			...row,
			...Object.fromEntries(Object.entries(ctx.body).filter(([, v]) => v !== undefined)),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.apps.replace(next);
		return {
			id: next.id,
			name: next.name,
			timeZone: next.timeZone,
			status: next.status,
			createdAt: next.createdAt,
			updatedAt: next.updatedAt,
		};
	},

	async "members.list"(ctx) {
		const rows = (await ctx.deps.store.c.members.list(ctx.app)).sort((a, b) =>
			a.displayName.localeCompare(b.displayName),
		);
		const page = paginate(rows, ctx.query.limit, ctx.query.cursor);
		return {
			...page,
			items: page.items.map((m) => ({
				subject: m.subject,
				displayName: m.displayName,
				...(m.email === undefined ? {} : { email: m.email }),
				roles: m.roles,
				coordinates: m.coordinates,
				createdAt: m.createdAt,
				updatedAt: m.updatedAt,
			})),
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
		await syncMember(ctx, ctx.app, subject, next);
		ctx.note({ roles: next.roles, created: held === undefined });
		return {
			subject,
			displayName: next.displayName,
			...(next.email === undefined ? {} : { email: next.email }),
			roles: next.roles,
			coordinates: next.coordinates,
			createdAt: next.createdAt,
			updatedAt: next.updatedAt,
		};
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
		await syncMember(ctx, ctx.app, subject, undefined);
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
		ctx.note({ grants: next.grants.length, denies: next.denies.length });
		return { grant: next.grants, deny: next.denies };
	},

	async "roles.list"(ctx) {
		return {
			items: (await ctx.deps.store.c.roles.list(ctx.app))
				.sort((a, b) => a.name.localeCompare(b.name))
				.map(roleOut),
		};
	},

	async "roles.create"(ctx) {
		const source =
			ctx.body.copyFrom === undefined
				? undefined
				: await must(ctx.deps.store.c.roles, ctx.app, ctx.body.copyFrom, "role");
		const role: RoleRow = {
			id: newId("r"),
			app: ctx.app,
			name: ctx.body.name,
			...(ctx.body.description === undefined ? {} : { description: ctx.body.description }),
			system: false,
			permissions: source?.permissions ?? [],
			...stamps(ctx.now),
		};
		const saved = await writeRowThenTuples(ctx, {
			write: () => ctx.deps.store.c.roles.insert(role),
			undo: async (r) => {
				await ctx.deps.store.c.roles.remove(ctx.app, r.id);
			},
			tuples: (r) => ({ writes: roleTuples(r), deletes: [] }),
		});
		return roleOut(saved);
	},

	async "roles.get"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		return {
			role: roleOut(role),
			matrix: CATALOGUE.map((def) => ({
				key: def.key,
				resource: def.resource,
				action: def.action,
				effect: def.effect,
				...(def.group === undefined ? {} : { fieldGroup: def.group }),
				name: labelOf(def),
				scoped: def.scopes.length > 1,
				scopes: [...def.scopes],
				held: def.scopes.filter((s) => role.permissions.includes(appRelation(def, s))),
			})),
		};
	},

	async "roles.update"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		const next: RoleRow = {
			...role,
			...(ctx.body.name === undefined ? {} : { name: ctx.body.name }),
			...(ctx.body.description === undefined ? {} : { description: ctx.body.description }),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.roles.replace(next);
		return roleOut(next);
	},

	async "roles.setPermissions"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		const valid = new Set(allAppRelations());
		const wanted = [...new Set(ctx.body.permissions)].sort();
		for (const p of wanted)
			if (!valid.has(p)) throw fail("invalid", "not a permission relation", { relation: p });
		if (!needsOwnerKept(role, wanted))
			throw fail("conflict", "the Owner role keeps the permissions that manage roles and members", {
				reason: "owner_lockout",
			});
		const next: RoleRow = { ...role, permissions: wanted, updatedAt: ctx.now };
		const change = diff(
			role.permissions.map((p) => roleGrant(role.id, role.app, p)),
			wanted.map((p) => roleGrant(role.id, role.app, p)),
		);
		await writeRowThenTuples(ctx, {
			write: async () => replaced(ctx.deps.store.c.roles, next),
			undo: async () => {
				await ctx.deps.store.c.roles.replace(role);
			},
			tuples: () => change,
		});
		ctx.note({ added: change.writes.length, removed: change.deletes.length });
		return roleOut(next);
	},

	async "roles.remove"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		if (isOwnerRole(role))
			throw fail("conflict", "the Owner role cannot be deleted", { reason: "owner_lockout" });
		const holders = (await ctx.deps.store.c.members.list(ctx.app)).filter((m) =>
			m.roles.includes(role.id),
		);
		if (holders.length > 0)
			throw fail("conflict", "people still hold this role", { holders: holders.length });
		await removeTuplesThenRow(ctx, {
			tuples: roleTuples(role),
			remove: async () => {
				await ctx.deps.store.c.roles.remove(ctx.app, role.id);
			},
		});
		return { ok: true as const };
	},
};

function roleOut(r: RoleRow): {
	id: string;
	name: string;
	description?: string;
	system: boolean;
	permissions: string[];
	createdAt: number;
	updatedAt: number;
} {
	return {
		id: r.id,
		name: r.name,
		...(r.description === undefined ? {} : { description: r.description }),
		system: r.system,
		permissions: r.permissions,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
	};
}
