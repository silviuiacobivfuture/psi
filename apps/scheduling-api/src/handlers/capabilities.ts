import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import {
	type AppMe,
	FIELD_GROUPS,
	type FieldGroupName,
	type ScopeName,
} from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import { CATALOGUE, type PermissionDef, parseRelation } from "../authz/catalogue";
import type { Ctx } from "../http/context";
import { fail } from "../http/errors";
import { must } from "./shared";

type Out = z.output<typeof AppMe>;
type C = Ctx<RouteSpec>;

const SCOPE_ORDER: readonly ScopeName[] = ["all", "assigned", "own"];

/** The permissions map and the field groups it implies, from what is held per catalogue entry (null: not held). */
function summarize(
	held: ReadonlyArray<{ def: PermissionDef; scopes: ReadonlyArray<ScopeName> | null }>,
): Pick<Out, "permissions" | "fieldGroups"> {
	const permissions: Record<string, ScopeName[]> = {};
	const groups = new Set<FieldGroupName>();
	for (const { def, scopes } of held) {
		if (scopes === null) continue;
		permissions[def.key] = [...scopes];
		if (def.fieldGroup !== undefined && def.effect === "read") groups.add(def.fieldGroup);
	}
	return { permissions, fieldGroups: FIELD_GROUPS.filter((g) => groups.has(g)) };
}

/** The people whose rows a narrowed scope reaches for this subject (their own person record; the ones they coordinate). */
async function reachOf(ctx: C, subject: string, coordinates: ReadonlyArray<string>) {
	const people = await ctx.deps.store.c.people.list(ctx.app);
	return {
		own: people.filter((p) => p.subject === subject).map((p) => p.id),
		assigned: [...coordinates],
	};
}

/** What the caller holds in the app, asked of the authorizer (a Check per catalogue entry). */
export async function ownCapabilities(ctx: C): Promise<Out> {
	const row = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
	const member = await ctx.deps.store.c.members.get(ctx.app, ctx.subject);
	const held = await Promise.all(
		CATALOGUE.map(async (def) => ({
			def,
			scopes: await ctx.deps.access.held(ctx.subject, ctx.app, def.key),
		})),
	);
	return {
		app: row.id,
		appName: row.name,
		timeZone: row.timeZone,
		subject: ctx.subject,
		...(member === undefined ? {} : { displayName: member.displayName }),
		roles: member?.roles ?? [],
		...summarize(held),
		reach: await reachOf(ctx, ctx.subject, member?.coordinates ?? []),
		platformAdmin: await ctx.deps.access.isPlatformAdmin(ctx.subject),
	};
}

/** `role:<id>` or `member:<subject>`. */
export function parseViewAs(raw: string): { kind: "role" | "member"; id: string } {
	const at = raw.indexOf(":");
	const kind = raw.slice(0, at);
	if ((kind !== "role" && kind !== "member") || at < 0 || at === raw.length - 1)
		throw fail("invalid", "view as `role:<id>` or `member:<subject>`", { field: "as" });
	return { kind, id: raw.slice(at + 1) };
}

/** Relations (`clients_edit_own`, or a bare unscoped key) into the scopes held per key. */
function fromRelations(relations: Iterable<string>, denied: ReadonlySet<string>) {
	const byKey = new Map<string, Set<ScopeName>>();
	for (const relation of relations) {
		const parsed = parseRelation(relation);
		if (parsed === undefined || denied.has(parsed.def.key)) continue;
		const scopes = byKey.get(parsed.def.key) ?? new Set<ScopeName>();
		if (parsed.scope !== undefined) scopes.add(parsed.scope);
		byKey.set(parsed.def.key, scopes);
	}
	return CATALOGUE.map((def) => {
		const scopes = byKey.get(def.key);
		return {
			def,
			scopes: scopes === undefined ? null : SCOPE_ORDER.filter((s) => scopes.has(s)),
		};
	});
}

/**
 * What a role (or a member, through their roles, grants and denials) would hold in this app, computed from the stored
 * grants and never asked of the authorizer: the caller's own reach is not the target's. Read-only by construction.
 */
export async function viewAsCapabilities(ctx: C, target: string): Promise<Out> {
	const { kind, id } = parseViewAs(target);
	const row = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
	const base = { app: row.id, appName: row.name, timeZone: row.timeZone, platformAdmin: false };
	if (kind === "role") {
		const role = await must(ctx.deps.store.c.roles, ctx.app, id, "role");
		return {
			...base,
			subject: `role:${role.id}`,
			displayName: role.name,
			roles: [role.id],
			...summarize(fromRelations(role.permissions, new Set())),
			reach: { own: [], assigned: [] },
		};
	}
	const member = await must(ctx.deps.store.c.members, ctx.app, id, "member");
	const roles = await ctx.deps.store.c.roles.list(ctx.app);
	const relations = [
		...roles.filter((r) => member.roles.includes(r.id)).flatMap((r) => r.permissions),
		...member.grants,
	];
	return {
		...base,
		subject: member.subject,
		displayName: member.displayName,
		roles: member.roles,
		...summarize(fromRelations(relations, new Set(member.denies))),
		reach: await reachOf(ctx, member.subject, member.coordinates),
	};
}
