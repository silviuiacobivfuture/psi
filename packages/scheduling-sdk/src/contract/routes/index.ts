import { CATALOG_ROUTES, ME_ROUTES } from "./team-admin";
import { AVAILABILITY_ROUTES } from "./team-availability";
import { BLACKLIST_ROUTES } from "./team-blacklist";
import { CALENDAR_ROUTES } from "./team-clinic";
import { FEEDBACK_ROUTES } from "./team-feedback";
import { INVITE_ROUTES } from "./team-invite";
import { LINK_ROUTES } from "./team-links";
import { SETTINGS_ROUTES } from "./team-me";
import { NOTE_ROUTES } from "./team-notes";
import { OWNERSHIP_ROUTES } from "./team-ownership";
import { PLAN_ROUTES } from "./team-plan";
import { META_ROUTES, OPERATION_ROUTES } from "./team-records";
import { REPORT_ROUTES } from "./team-reports";
import { SERIES_ROUTES } from "./team-series";
import { STAFF_ROUTES } from "./team-staff";
import { VISITOR_ROUTES } from "./visitor";

/** THE contract: one row per route. The server mounts it, the SDK and the OpenAPI document derive from it. */
export const ROUTES = [
	...META_ROUTES,
	...VISITOR_ROUTES,
	...ME_ROUTES,
	...SETTINGS_ROUTES,
	...CATALOG_ROUTES,
	...CALENDAR_ROUTES,
	...SERIES_ROUTES,
	...NOTE_ROUTES,
	...REPORT_ROUTES,
	...OPERATION_ROUTES,
	...PLAN_ROUTES,
	...BLACKLIST_ROUTES,
	...FEEDBACK_ROUTES,
	...INVITE_ROUTES,
	...LINK_ROUTES,
	...STAFF_ROUTES,
	...OWNERSHIP_ROUTES,
	...AVAILABILITY_ROUTES,
] as const;
export type Routes = typeof ROUTES;
export type Route = Routes[number];
export type RouteId = Route["id"];
