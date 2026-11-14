import { route } from "../define";
import {
	StaffInviteBody,
	StaffInviteResult,
	StaffLinkResult,
	StaffQuery,
	StaffSearch,
} from "../entities-staff";
import { AppParam, Subject } from "../primitives";

const SubjectParam = AppParam.extend({ subject: Subject });

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
	route({
		id: "staff.link",
		method: "POST",
		path: "/v1/apps/:app/members/:subject/sign-in-link",
		side: "team",
		summary:
			"The set-password link of a member who has never signed in, with the latest instant it works (the sign-in keeps one per person for 30 minutes and answers the same one meanwhile); the journal records that it was shown, never the link",
		params: SubjectParam,
		response: StaffLinkResult,
		permission: AddMember,
		audit: "member.link",
	}),
] as const;
