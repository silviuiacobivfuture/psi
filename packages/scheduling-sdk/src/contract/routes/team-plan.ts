import { route } from "../define";
import { OrgProfileDoc, OrgProfilePut, PublicContact } from "../entities-org";
import { FloorPlan, FloorPlanPut } from "../entities-plan";
import { AppParam } from "../primitives";

/** Documents an app keeps beside its data: the floor plan and the organisation's contact profile. */
export const PLAN_ROUTES = [
	route({
		id: "floorPlan.get",
		method: "GET",
		path: "/v1/apps/:app/floor-plan",
		side: "team",
		summary: "The app's floor plan with its revision (revision 0 and no document: none drawn yet)",
		params: AppParam,
		response: FloorPlan,
		permission: { key: "calendars_view", target: { kind: "list", type: "sched_calendar" } },
	}),
	route({
		id: "floorPlan.put",
		method: "PUT",
		path: "/v1/apps/:app/floor-plan",
		side: "team",
		summary:
			"Save the floor plan edited from `revision`; the stored revision becomes revision + 1, or 409 stale when it moved on",
		params: AppParam,
		body: FloorPlanPut,
		response: FloorPlan,
		permission: { key: "app_settings_edit", target: { kind: "app" } },
		audit: "floorplan.put",
	}),
	route({
		id: "orgProfile.get",
		method: "GET",
		path: "/v1/apps/:app/org-profile",
		side: "team",
		summary:
			"The organisation's contact profile (address, phones, e-mail, website, hours, legal identity) with its revision (0 and no profile: none saved yet)",
		params: AppParam,
		response: OrgProfileDoc,
		permission: { key: "app_settings_view", target: { kind: "app" } },
	}),
	route({
		id: "orgProfile.put",
		method: "PUT",
		path: "/v1/apps/:app/org-profile",
		side: "team",
		summary:
			"Save the whole contact profile edited from `revision`; the stored revision becomes revision + 1, or 409 stale when it moved on",
		params: AppParam,
		body: OrgProfilePut,
		response: OrgProfileDoc,
		permission: { key: "app_settings_edit", target: { kind: "app" } },
		audit: "org.profile",
	}),
	route({
		id: "visitor.contact",
		method: "GET",
		path: "/v1/apps/:app/book/contact",
		side: "visitor",
		summary:
			"How the public reaches the organisation: its name and contact profile, for a site's contact page and footer",
		params: AppParam,
		response: PublicContact,
	}),
] as const;
