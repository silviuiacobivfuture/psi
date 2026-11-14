import type { TeamResolver } from "@psi/notify";
import type { Access } from "../authz/access";
import type { StorePort } from "../store/types";

/**
 * Who a team is, at the moment of sending: the members of the app who hold the permission the catalogue entry names (on
 * the whole app, not only their own rows), minus the one who did it and minus the holders of a second permission when the
 * message is split in two (a digest's revenue line). A person who lost the permission stops getting its notifications
 * the same day; a role edited in the console changes who is told with no other step.
 */
export function createTeamResolver(store: StorePort, access: Access): TeamResolver {
	return async (app, entry, team) => {
		const needs = team.needs ?? entry.needs;
		if (needs === undefined) return [];
		const people = [];
		for (const member of await store.c.members.list(app)) {
			if (member.subject === team.except) continue;
			if (!(await access.canAll(member.subject, app, needs))) continue;
			if (team.without !== undefined && (await access.canAll(member.subject, app, team.without)))
				continue;
			people.push({
				subject: member.subject,
				name: member.displayName,
				...(member.email === undefined ? {} : { email: member.email }),
				locale: "ro" as const,
			});
		}
		return people;
	};
}
