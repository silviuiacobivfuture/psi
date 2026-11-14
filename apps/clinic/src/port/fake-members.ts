import { type ClinicPort, PortError } from "./port";
import { capabilityMap, ENTRIES, splitRelation } from "./role-map";
import {
	type AppSlug,
	FIELD_GROUPS,
	type Membership,
	type Role,
	SCOPES,
	type ScopeName,
} from "./schema";
import {
	type MemberDetail,
	MemberInputSchema,
	OverridesInputSchema,
	type PermissionRow,
} from "./schema-members";
import type { AppData } from "./seed";

/** One member of one app in the fake, as the service keeps them. */
export interface TeamEntry {
	displayName: string;
	email?: string;
	roles: string[];
	coordinates: string[];
	grants: string[];
	denies: string[];
	/** The person columns bound to the member's sign-in. */
	calendars: string[];
}

/** app → subject → member: the fake's team, changed by the members' screen and read by every capability answer. */
export type FakeTeam = Map<AppSlug, Map<string, TeamEntry>>;

export function teamFrom(
	members: Readonly<Record<string, ReadonlyArray<Membership>>>,
	names: Readonly<Record<string, string>> | undefined,
): FakeTeam {
	const team: FakeTeam = new Map();
	for (const [subject, ms] of Object.entries(members))
		for (const m of ms) {
			const app = team.get(m.app) ?? new Map<string, TeamEntry>();
			app.set(subject, {
				displayName: names?.[subject] ?? subject,
				roles: [...m.roles],
				coordinates: [],
				grants: [],
				denies: [],
				calendars: [],
			});
			team.set(m.app, app);
		}
	return team;
}

export const membershipsOf = (team: FakeTeam, subject: string): Membership[] =>
	[...team].flatMap(([app, people]) => {
		const e = people.get(subject);
		return e === undefined ? [] : [{ app, roles: [...e.roles] }];
	});

/** Individual grants add a scope, denials take one away and win over everything else. */
export function withOverrides(
	permissions: Record<string, ScopeName[]>,
	entry: Pick<TeamEntry, "grants" | "denies"> | undefined,
): Record<string, ScopeName[]> {
	if (entry === undefined) return permissions;
	const out: Record<string, ScopeName[]> = { ...permissions };
	const keyOf = (relation: string): { key: string; scope: ScopeName } => {
		const { key, scope, group } = splitRelation(relation);
		return { key: group === null ? key : `${key}_${group}`, scope: scope ?? "all" };
	};
	for (const g of entry.grants) {
		const { key, scope } = keyOf(g);
		out[key] = [...new Set([...(out[key] ?? []), scope])];
	}
	for (const d of entry.denies) {
		const { key, scope } = keyOf(d);
		const left = (out[key] ?? []).filter((s) => s !== scope);
		if (left.length === 0) delete out[key];
		else out[key] = left;
	}
	return out;
}

/** What the member holds through their roles, before grants and denials. */
function fromRoles(roles: ReadonlyArray<Role>): Record<string, ScopeName[]> {
	const out: Record<string, ScopeName[]> = {};
	for (const r of roles)
		for (const [k, v] of Object.entries(capabilityMap(r)))
			out[k] = [...new Set([...(out[k] ?? []), ...v])];
	return out;
}

function matrixOf(held: Record<string, ScopeName[]>): PermissionRow[] {
	const row = (
		key: string,
		resource: string,
		action: string,
		fieldGroup?: string,
	): PermissionRow => ({
		key,
		resource,
		action,
		...(fieldGroup === undefined ? {} : { fieldGroup }),
		scopes: [...SCOPES],
		held: SCOPES.filter((s) => held[key]?.includes(s) === true),
	});
	return [
		...ENTRIES.map((e) => row(e.key, e.resource.key, e.action)),
		...FIELD_GROUPS.map((g) => row(`clients_view_${g}`, "clients", "view", g)),
	];
}

export interface MembersDeps {
	team: FakeTeam;
	/** Who the fake acts as: nobody changes their own membership. */
	self: string;
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
}

type Methods = Pick<
	ClinicPort,
	"member" | "saveMember" | "saveMemberOverrides" | "removeMember" | "linkCalendar"
>;

/** The members' screen over the fake team: the service's rules (no self-change, known roles and people only). */
export function createFakeMembers(deps: MembersDeps): Methods {
	const { team, guard, log, data } = deps;
	const people = (app: AppSlug): Map<string, TeamEntry> => {
		const p = team.get(app) ?? new Map<string, TeamEntry>();
		team.set(app, p);
		return p;
	};
	const notSelf = (subject: string): void => {
		if (subject === deps.self) throw new PortError("forbidden", "self");
	};
	const held = (app: AppSlug, subject: string): TeamEntry => {
		const e = people(app).get(subject);
		if (e === undefined) throw new PortError("not-found", subject);
		return e;
	};
	return {
		async member(app, subject): Promise<MemberDetail | null> {
			guard("member");
			const e = people(app).get(subject);
			if (e === undefined) return null;
			const roles = data(app).roles.filter((r) => e.roles.includes(r.id));
			return {
				subject,
				displayName: e.displayName,
				...(e.email === undefined ? {} : { email: e.email }),
				roles: [...e.roles],
				coordinates: [...e.coordinates],
				grant: [...e.grants],
				deny: [...e.denies],
				calendars: [...e.calendars],
				taken: [...people(app)].flatMap(([s, x]) => (s === subject ? [] : x.calendars)),
				matrix: matrixOf(withOverrides(fromRoles(roles), e)),
			};
		},
		async saveMember(app, subject, raw) {
			guard("saveMember");
			notSelf(subject);
			const input = MemberInputSchema.safeParse(raw);
			if (!input.success) throw new PortError("invalid", "member");
			const d = data(app);
			if (!input.data.roles.every((r) => d.roles.some((x) => x.id === r)))
				throw new PortError("invalid", "roles");
			if (
				!input.data.coordinates.every((p) =>
					d.columns.some((c) => c.id === p && c.kind === "person"),
				)
			)
				throw new PortError("invalid", "coordinates");
			const was = people(app).get(subject);
			const next: TeamEntry = {
				displayName: input.data.displayName,
				...(input.data.email === undefined ? {} : { email: input.data.email }),
				roles: [...new Set(input.data.roles)],
				coordinates: [...new Set(input.data.coordinates)],
				grants: was?.grants ?? [],
				denies: was?.denies ?? [],
				calendars: was?.calendars ?? [],
			};
			people(app).set(subject, next);
			log(d, "console", "member.put", `members:${subject}`);
			return {
				subject,
				displayName: next.displayName,
				roles: next.roles,
				...(next.email === undefined ? {} : { email: next.email }),
			};
		},
		async saveMemberOverrides(app, subject, raw) {
			guard("saveMemberOverrides");
			notSelf(subject);
			const input = OverridesInputSchema.safeParse(raw);
			if (!input.success) throw new PortError("invalid", "overrides");
			const e = held(app, subject);
			e.grants = [...new Set(input.data.grant)].sort();
			e.denies = [...new Set(input.data.deny)].sort();
			log(data(app), "console", "member.overrides", `members:${subject}`);
			return { grant: e.grants, deny: e.denies };
		},
		async removeMember(app, subject) {
			guard("removeMember");
			notSelf(subject);
			held(app, subject);
			people(app).delete(subject);
			log(data(app), "console", "member.remove", `members:${subject}`);
		},
		async linkCalendar(app, subject, personId) {
			guard("linkCalendar");
			const e = held(app, subject);
			if (!data(app).columns.some((c) => c.id === personId && c.kind === "person"))
				throw new PortError("invalid", "person");
			// A calendar belongs to one sign-in, as in the service: binding it moves it.
			for (const other of people(app).values())
				other.calendars = other.calendars.filter((id) => id !== personId);
			e.calendars = [...new Set([...e.calendars, personId])];
		},
	};
}
