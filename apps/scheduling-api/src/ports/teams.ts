import type { MemberRow, RoleRow } from "../store/types";
import type { TeamName } from "./notify";

/** The teams a member belongs to, from the roles they hold: everyone is the team; Owner is the owners; Reception is reception. */
export function teamsOf(
	member: MemberRow | undefined,
	roles: readonly RoleRow[],
): ReadonlySet<TeamName> {
	if (member === undefined) return new Set();
	const names = new Set(roles.filter((r) => member.roles.includes(r.id)).map((r) => r.name));
	const teams = new Set<TeamName>(["team"]);
	if (names.has("Owner")) teams.add("owners");
	if (names.has("Reception")) teams.add("reception");
	return teams;
}
