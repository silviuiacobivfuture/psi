import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx } from "../http/context";
import type { TeamName } from "../ports/notify";
import type { MemberRow, RoleRow } from "../store/types";

type C = Ctx<RouteSpec>;

/** The teams a member belongs to, from the roles they hold: everyone is the team; Owner is the owners; Reception is reception. */
function teamsOf(member: MemberRow | undefined, roles: readonly RoleRow[]): ReadonlySet<TeamName> {
	if (member === undefined) return new Set();
	const names = new Set(roles.filter((r) => member.roles.includes(r.id)).map((r) => r.name));
	const teams = new Set<TeamName>(["team"]);
	if (names.has("Owner")) teams.add("owners");
	if (names.has("Reception")) teams.add("reception");
	return teams;
}

/**
 * Keeps the notifier's directory in step with a member who was added, changed or removed: their subscriber, and the
 * teams (topics) their roles put them in or take them out of. A failure is logged and never fails the change the person
 * made: the next change of the member puts it right.
 */
export async function syncMember(
	ctx: C,
	app: string,
	subject: string,
	before: MemberRow | undefined,
	after: MemberRow | undefined,
): Promise<void> {
	try {
		const roles = await ctx.deps.store.c.roles.list(app);
		const was = teamsOf(before, roles);
		const now = teamsOf(after, roles);
		const row = after ?? before;
		await ctx.deps.notifier.syncPerson(
			app,
			{
				subject,
				...(row === undefined ? {} : { name: row.displayName }),
				...(row?.email === undefined ? {} : { email: row.email }),
			},
			{
				add: [...now].filter((t) => !was.has(t)),
				remove: [...was].filter((t) => !now.has(t)),
			},
		);
	} catch {
		ctx.deps.log({ level: "error", event: "notify_directory_failed", requestId: ctx.requestId });
	}
}
