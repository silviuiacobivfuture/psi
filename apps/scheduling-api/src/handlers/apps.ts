import { allAppRelations, CATALOGUE, parseRelation, permissionOf } from "../authz/catalogue";
import { ACTION_LABEL, RESOURCE_LABEL } from "../authz/labels";
import {
	coordinatorLink,
	memberLink,
	personalGrant,
	roleAppLink,
	roleGrant,
	roleHolder,
} from "../authz/links";
import type { Tuple } from "../authz/port";
import { seedRoles } from "../authz/roles-seed";
import type { Deps, HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { MemberRow, RoleRow } from "../store/types";
import { ownCapabilities, viewAsCapabilities } from "./capabilities";
import { diff, must, newId, paginate, stamps, writeTuples } from "./shared";

const GUARDED = [
	"roles_view",
	"roles_create",
	"roles_edit",
	"roles_delete",
	"members_view",
	"members_edit",
];

/** Creates an app with its seed roles and its first owner, and the tuples that make them real. */
export async function provisionApp(
	deps: Deps,
	input: { id: string; name: string; timeZone: string; ownerSubject: string },
) {
	const { id, name, timeZone, ownerSubject } = input;
	const now = deps.clock();
	await deps.store.c.apps.insert({ id, app: id, name, timeZone, status: "active", ...stamps(now) });
	const roles: RoleRow[] = seedRoles().map((r) => ({
		id: `${id}-${r.slug}`,
		app: id,
		name: r.name,
		description: r.description,
		system: true,
		permissions: [...new Set(r.permissions)].sort(),
		...stamps(now),
	}));
	for (const role of roles) await deps.store.c.roles.insert(role);
	const owner: MemberRow = {
		id: ownerSubject,
		app: id,
		subject: ownerSubject,
		displayName: ownerSubject,
		roles: [`${id}-owner`],
		coordinates: [],
		grants: [],
		denies: [],
		...stamps(now),
	};
	await deps.store.c.members.insert(owner);
	await deps.authz.write({
		writes: [
			{ user: "platform:psi", relation: "parent_platform", object: `sched_app:${id}` },
			...roles.flatMap(roleTuples),
			...memberTuples(owner),
		],
		deletes: [],
	});
	return { id, name, timeZone, status: "active" as const, createdAt: now, updatedAt: now };
}

const roleTuples = (role: RoleRow): Tuple[] => [
	roleAppLink(role.id, role.app),
	...role.permissions.map((p) => roleGrant(role.id, role.app, p)),
];
const memberTuples = (m: MemberRow): Tuple[] => [
	memberLink(m.app, m.subject),
	...m.roles.map((r) => roleHolder(r, m.subject)),
	...m.coordinates.map((p) => coordinatorLink(p, m.subject)),
	...m.grants.map((g) => personalGrant(m.app, m.subject, g)),
];

function needsOwnerKept(role: RoleRow, permissions: readonly string[]): boolean {
	if (!role.system || !role.id.endsWith("-owner")) return true;
	return GUARDED.flatMap((k) => (permissionOf(k)?.scopes.length ? [`${k}_all`] : [k])).every((r) =>
		permissions.includes(r),
	);
}

export const appHandlers: HandlersOf<
	| "me.get"
	| "me.app"
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

	async "me.app"(ctx) {
		const target = ctx.query.as;
		if (target === undefined) return ownCapabilities(ctx);
		// Seeing the app as someone else is for roles administrators only.
		if (!(await ctx.canAll("roles_edit")))
			throw forbidden("the role does not allow this", { permission: "roles_edit" });
		return viewAsCapabilities(ctx, target);
	},

	async "apps.create"(ctx) {
		const { id, name, timeZone, ownerSubject } = ctx.body;
		if (await ctx.deps.store.c.apps.get(id, id)) throw fail("conflict", "the app exists");
		return provisionApp(ctx.deps, { id, name, timeZone, ownerSubject });
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
		if (held === undefined) await ctx.deps.store.c.members.insert(next);
		else await ctx.deps.store.c.members.replace(next);
		const change = diff(held === undefined ? [] : memberTuples(held), memberTuples(next));
		await writeTuples(ctx, change.writes, change.deletes);
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
		await ctx.deps.store.c.members.remove(ctx.app, subject);
		await writeTuples(ctx, [], memberTuples(held));
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
			if (permissionOf(d) === undefined) throw fail("invalid", "not a permission key", { key: d });
		const next: MemberRow = {
			...held,
			grants: [...new Set(ctx.body.grant)].sort(),
			denies: [...new Set(ctx.body.deny)].sort(),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.members.replace(next);
		const change = diff(
			held.grants.map((g) => personalGrant(ctx.app, subject, g)),
			next.grants.map((g) => personalGrant(ctx.app, subject, g)),
		);
		await writeTuples(ctx, change.writes, change.deletes);
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
		await ctx.deps.store.c.roles.insert(role);
		await writeTuples(ctx, roleTuples(role));
		return roleOut(role);
	},

	async "roles.get"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		return {
			role: roleOut(role),
			matrix: CATALOGUE.map((def) => {
				const scopes = def.scopes.length === 0 ? (["all"] as const) : def.scopes;
				const held = scopes.filter((s) =>
					role.permissions.includes(def.scopes.length === 0 ? def.key : `${def.key}_${s}`),
				);
				return {
					key: def.key,
					resource: def.resource,
					action: def.action,
					effect: def.effect,
					...(def.fieldGroup === undefined ? {} : { fieldGroup: def.fieldGroup }),
					name: {
						ro: `${RESOURCE_LABEL[def.resource]?.ro ?? def.resource}: ${ACTION_LABEL[def.action]?.ro ?? def.action}`,
						en: `${RESOURCE_LABEL[def.resource]?.en ?? def.resource}: ${ACTION_LABEL[def.action]?.en ?? def.action}`,
					},
					scopes: [...scopes],
					held,
				};
			}),
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
		await ctx.deps.store.c.roles.replace(next);
		const change = diff(
			role.permissions.map((p) => roleGrant(role.id, role.app, p)),
			wanted.map((p) => roleGrant(role.id, role.app, p)),
		);
		await writeTuples(ctx, change.writes, change.deletes);
		ctx.note({ added: change.writes.length, removed: change.deletes.length });
		return roleOut(next);
	},

	async "roles.remove"(ctx) {
		const role = await must(ctx.deps.store.c.roles, ctx.app, String(ctx.params.id), "role");
		if (role.system && role.id.endsWith("-owner"))
			throw fail("conflict", "the Owner role cannot be deleted", { reason: "owner_lockout" });
		const holders = (await ctx.deps.store.c.members.list(ctx.app)).filter((m) =>
			m.roles.includes(role.id),
		);
		if (holders.length > 0)
			throw fail("conflict", "people still hold this role", { holders: holders.length });
		await ctx.deps.store.c.roles.remove(ctx.app, role.id);
		await writeTuples(ctx, [], roleTuples(role));
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
