import { route } from "../define";
import { FloorPlan, FloorPlanPut } from "../entities-plan";
import { AppParam } from "../primitives";

/** Documents an app keeps beside its data: today the floor plan. */
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
] as const;
