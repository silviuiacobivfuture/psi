import { route } from "../define";
import { StaffInviteBody, StaffInviteResult, StaffQuery, StaffSearch } from "../entities-staff";
import { AppParam } from "../primitives";

const AddMember = { key: "members_create", target: { kind: "app" } } as const;

/** Adding a member by who they are, not by their sign-in id: whoever may add members may use both. */
export const STAFF_ROUTES = [
	route({
		id: "staff.search",
		method: "GET",
		path: "/v1/apps/:app/staff-accounts",
		side: "team",
		summary:
			"People of the estate's staff group whose name or e-mail match (at least two characters; at most 20 answers); clients' accounts are never offered",
		params: AppParam,
		query: StaffQuery,
		response: StaffSearch,
		permission: AddMember,
	}),
	route({
		id: "staff.invite",
		method: "POST",
		path: "/v1/apps/:app/staff-accounts",
		side: "team",
		summary:
			"Invite someone by e-mail: find or make their account in the staff group, add them to the app with these roles, and e-mail them; a new account comes back with a one-time set-password link for the inviter",
		params: AppParam,
		body: StaffInviteBody,
		response: StaffInviteResult,
		permission: AddMember,
		audit: "member.invite",
	}),
] as const;
