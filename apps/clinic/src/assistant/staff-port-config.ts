import type { StaffPort } from "@psi/engine/staff";
import { ROUTES, type RouteSpec } from "@psi/scheduling-sdk/contract";
import type { ClinicPort } from "../port/port";
import type { AppSlug } from "../port/schema";
import { ok, refused, wrap } from "./staff-result";

export interface ConfigOptions {
	port: ClinicPort;
	app: AppSlug;
	/** Looking at the app as someone else: no route that changes anything is called (the service refuses it too). */
	readOnly: boolean;
}

const WRITES = new Set<string>(
	(ROUTES as ReadonlyArray<RouteSpec>).filter((r) => r.method !== "GET").map((r) => r.id),
);

/**
 * What governs the person's turn and what it used, and any route of the service by id: each through the console's
 * port, so the service answers for the signed-in person with their own token, exactly as for the screens.
 */
export function configMethods(
	o: ConfigOptions,
): Pick<StaffPort, "assistant" | "recordUsage" | "callRoute"> {
	const { port, app } = o;
	return {
		assistant: () => wrap(async () => ok(await port.assistantEffective(app))),
		recordUsage: (usage) =>
			wrap(async () => {
				const stop = await port.recordAssistantUsage(app, { surface: "staff", ...usage });
				return ok(stop === undefined ? {} : { stop });
			}),
		callRoute: (call) =>
			wrap(async () => {
				if (o.readOnly && WRITES.has(call.routeId)) return refused("forbidden");
				// The app is the session's own: a route is never called for another app than the one the person is in.
				return ok(await port.callRoute(call.routeId, { ...call.input, app }));
			}),
	};
}
