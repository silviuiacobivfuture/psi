import { createHash } from "node:crypto";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { type Capabilities, FIELD_GROUPS, type ScopeName } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import { CATALOGUE, parseRelation } from "../authz/catalogue";
import { roleKeys, rolesById } from "../authz/composition";
import { SETTLE_MS } from "../authz/held-kept";
import type { Ctx } from "../http/context";
import { fail } from "../http/errors";
import type { MemberRow, PersonRow, RoleRow } from "../store/types";
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
function reachOf(people: readonly PersonRow[], subject: string, coordinates: readonly string[]) {
	return {
		own: people.filter((p) => p.subject === subject).map((p) => p.id),
		assigned: [...coordinates],
	};
}

/** The names of the roles a member holds, by role id. */
function namesOf(roles: readonly RoleRow[], ids: readonly string[]): Record<string, string> {
	return Object.fromEntries(roles.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.name]));
}

/**
 * The rows a member's held scopes derive from, digested: the member's roles, grants, denials and coordinators, every
 * role's permissions and inclusions, and the platform administrator's standing. Any change is another fingerprint. Kept
 * only when none of those rows changed in the last moments (their tuples may still be on the way).
 */
function basisOf(
	ctx: C,
	member: MemberRow | undefined,
	roles: readonly RoleRow[],
	platformAdmin: boolean,
): { fingerprint: string; keep: boolean; now: number } {
	const now = ctx.deps.clock();
	const rows = [
		member === undefined
			? null
			: [member.roles, member.grants, member.denies, member.coordinates, member.updatedAt],
		[...roles]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((r) => [r.id, r.permissions, r.includes, r.updatedAt]),
		platformAdmin,
	];
	const changed = Math.max(member?.updatedAt ?? 0, ...roles.map((r) => r.updatedAt));
	return {
		fingerprint: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
		keep: now - changed >= SETTLE_MS,
		now,
	};
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
	// The rows are independent: asked side by side, then the catalogue (kept while they are unchanged).
	const [app, member, roles, people, platformAdmin] = await Promise.all([
		must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app"),
		ctx.deps.store.c.members.get(ctx.app, subject),
		ctx.deps.store.c.roles.list(ctx.app),
		ctx.deps.store.c.people.list(ctx.app),
		ctx.deps.access.isPlatformAdmin(subject),
	]);
	if (viewAs !== undefined && member === undefined) throw fail("not_found", "member not found");
	const held = await ctx.deps.held.get(
		`${ctx.app}\u0000${subject}`,
		() =>
			ctx.deps.access.scopesHeldMany(
				subject,
				ctx.app,
				CATALOGUE.map((def) => def.key),
			),
		basisOf(ctx, member, roles, platformAdmin),
	);
	return {
		subject,
		app: app.id,
		appName: app.name,
		timeZone: app.timeZone,
		...(member === undefined ? {} : { displayName: member.displayName }),
		roles: member?.roles ?? [],
		roleNames: namesOf(roles, member?.roles ?? []),
		...summarize(held),
		denied: [...(member?.denies ?? [])].sort(),
		reach: reachOf(people, subject, member?.coordinates ?? []),
		platformAdmin,
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
