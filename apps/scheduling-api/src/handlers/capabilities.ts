import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { type Capabilities, FIELD_GROUPS, type ScopeName } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import { CATALOGUE, parseRelation } from "../authz/catalogue";
import { roleKeys, rolesById } from "../authz/composition";
import type { Ctx } from "../http/context";
import { fail } from "../http/errors";
import { must } from "./shared";

type Out = z.output<typeof Capabilities>;
type C = Ctx<RouteSpec>;
type Held = ReadonlyMap<string, readonly ScopeName[]>;

const ORDER: readonly ScopeName[] = ["all", "assigned", "own"];

/**
 * The permissions map, and the field groups it implies (a group is seen when some read permission of it is held).
 * Feedback has groups of its own (what a client wrote, how to reach them): they say nothing about client records.
 */
function summarize(held: Held): Pick<Out, "permissions" | "fieldGroups"> {
	const permissions: Record<string, ScopeName[]> = {};
	const groups = new Set<string>();
	for (const def of CATALOGUE) {
		const scopes = held.get(def.key) ?? [];
		if (scopes.length === 0) continue;
		permissions[def.key] = ORDER.filter((s) => scopes.includes(s));
		if (def.group !== undefined && def.effect === "read" && def.resource !== "feedback") {
			groups.add(def.group);
		}
	}
	return { permissions, fieldGroups: FIELD_GROUPS.filter((g) => groups.has(g)) };
}

/** The people whose rows a narrowed scope reaches for this subject: their own person record, and the ones they coordinate. */
async function reachOf(ctx: C, subject: string, coordinates: readonly string[]) {
	const people = await ctx.deps.store.c.people.list(ctx.app);
	return {
		own: people.filter((p) => p.subject === subject).map((p) => p.id),
		assigned: [...coordinates],
	};
}

/** The names of the roles a member holds, by role id. */
async function namesOf(ctx: C, ids: readonly string[]): Promise<Record<string, string>> {
	const roles = await ctx.deps.store.c.roles.list(ctx.app);
	return Object.fromEntries(roles.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.name]));
}

/** `role:<id>`, `member:<subject>`, or a bare subject (a member). */
export function parseViewAs(raw: string): { kind: "role" | "member"; id: string } {
	const colon = raw.indexOf(":");
	if (colon < 0) return { kind: "member", id: raw };
	const kind = raw.slice(0, colon);
	const id = raw.slice(colon + 1);
	if ((kind !== "role" && kind !== "member") || id === "")
		throw fail("invalid", "view as `role:<id>` or `member:<subject>`", { field: "as" });
	return { kind, id };
}

/**
 * What a member holds in the app, asked of the authorizer in ONE batch for the whole catalogue: the member's own
 * relations, denials removed.
 */
async function ofMember(ctx: C, subject: string, viewAs: Out["viewAs"]): Promise<Out> {
	const app = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
	const member = await ctx.deps.store.c.members.get(ctx.app, subject);
	if (viewAs !== undefined && member === undefined) throw fail("not_found", "member not found");
	const held = await ctx.deps.access.scopesHeldMany(
		subject,
		ctx.app,
		CATALOGUE.map((def) => def.key),
	);
	return {
		subject,
		app: app.id,
		appName: app.name,
		timeZone: app.timeZone,
		...(member === undefined ? {} : { displayName: member.displayName }),
		roles: member?.roles ?? [],
		roleNames: await namesOf(ctx, member?.roles ?? []),
		...summarize(held),
		denied: [...(member?.denies ?? [])].sort(),
		reach: await reachOf(ctx, subject, member?.coordinates ?? []),
		platformAdmin: await ctx.deps.access.isPlatformAdmin(subject),
		...(viewAs === undefined ? {} : { viewAs }),
	};
}

/**
 * What a role would hold: computed from its stored relations and those of every role it includes, never asked of the
 * authorizer (a role is no one's tuples). A role has no person, so it reaches no one's rows.
 */
async function ofRole(ctx: C, roleId: string): Promise<Out> {
	const app = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
	const role = await must(ctx.deps.store.c.roles, ctx.app, roleId, "role");
	const keys = roleKeys(role.id, rolesById(await ctx.deps.store.c.roles.list(ctx.app)));
	const held = new Map<string, ScopeName[]>();
	for (const relation of [...keys].sort()) {
		const parsed = parseRelation(relation);
		if (parsed === undefined) continue;
		held.set(parsed.def.key, [...(held.get(parsed.def.key) ?? []), parsed.scope]);
	}
	return {
		subject: `role:${role.id}`,
		app: app.id,
		appName: app.name,
		timeZone: app.timeZone,
		displayName: role.name,
		roles: [role.id],
		roleNames: { [role.id]: role.name },
		...summarize(held),
		denied: [],
		reach: { own: [], assigned: [] },
		platformAdmin: false,
		viewAs: { kind: "role", id: role.id },
	};
}

/** The caller's own capabilities (`as` absent) or a role's or member's (`as` present; the caller has checked the right to). */
export function capabilitiesOf(ctx: C, as: string | undefined): Promise<Out> {
	if (as === undefined) return ofMember(ctx, ctx.subject, undefined);
	const target = parseViewAs(as);
	return target.kind === "role"
		? ofRole(ctx, target.id)
		: ofMember(ctx, target.id, { kind: "member", id: target.id });
}
