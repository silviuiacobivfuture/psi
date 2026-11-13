import { CATALOG_ROUTES, ME_ROUTES } from "./team-admin";
import { BLACKLIST_ROUTES } from "./team-blacklist";
import { CALENDAR_ROUTES } from "./team-clinic";
import { FEEDBACK_ROUTES } from "./team-feedback";
import { INVITE_ROUTES } from "./team-invite";
import { PLAN_ROUTES } from "./team-plan";
import { META_ROUTES, OPERATION_ROUTES } from "./team-records";
import { VISITOR_ROUTES } from "./visitor";

/** THE contract: one row per route. The server mounts it, the SDK and the OpenAPI document derive from it. */
export const ROUTES = [
	...META_ROUTES,
	...VISITOR_ROUTES,
	...ME_ROUTES,
	...CATALOG_ROUTES,
	...CALENDAR_ROUTES,
	...OPERATION_ROUTES,
	...PLAN_ROUTES,
	...BLACKLIST_ROUTES,
	...FEEDBACK_ROUTES,
	...INVITE_ROUTES,
] as const;
export type Routes = typeof ROUTES;
export type Route = Routes[number];
export type RouteId = Route["id"];
