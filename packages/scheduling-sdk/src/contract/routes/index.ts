import { CATALOG_ROUTES, ME_ROUTES } from "./team-admin";
import { CALENDAR_ROUTES } from "./team-clinic";
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
] as const;
export type Routes = typeof ROUTES;
export type Route = Routes[number];
export type RouteId = Route["id"];
