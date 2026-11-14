import { ROUTES, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { z } from "zod";
import type { ClinicPort } from "../port";
import { PortError } from "../port";
import type { SdkContext } from "./context";

type AssistantPart = Pick<
	ClinicPort,
	| "assistantEffective"
	| "recordAssistantUsage"
	| "assistantConfig"
	| "saveAssistantConfig"
	| "assistantPlatform"
	| "saveAssistantPlatform"
	| "callRoute"
>;

const Call = z.custom<(input: Record<string, unknown>) => Promise<unknown>>(
	(v) => typeof v === "function",
);

/** The SDK's method for a route of the table, found by the route's id (the client is derived from the same table). */
function methodOf(
	api: SdkContext["api"],
	spec: RouteSpec,
): (input: Record<string, unknown>) => Promise<unknown> {
	const [group = "", op = ""] = spec.id.split(".");
	const ops: unknown = Object.getOwnPropertyDescriptor(api, group)?.value;
	const fn: unknown =
		typeof ops === "object" && ops !== null
			? Object.getOwnPropertyDescriptor(ops, op)?.value
			: undefined;
	return Call.parse(fn);
}

/** The assistants' configuration and meters, and any route by id: all through the person's own client. */
export function assistantGroup(sdk: SdkContext): AssistantPart {
	const { api, run } = sdk;
	return {
		assistantEffective: (app) => run(() => api.me.assistant({ app })),
		async recordAssistantUsage(app, usage) {
			const out = await run(() => api.me.assistantUsage({ app, ...usage }));
			return out.stop;
		},
		assistantConfig: (app) => run(() => api.assistantConfig.get({ app })),
		saveAssistantConfig: (app, doc) => run(() => api.assistantConfig.put({ app, doc })),
		assistantPlatform: () => run(() => api.assistantPlatform.get({})),
		saveAssistantPlatform: (doc) => run(() => api.assistantPlatform.put({ doc })),
		async callRoute(routeId, input) {
			const spec = (ROUTES as ReadonlyArray<RouteSpec>).find((r) => r.id === routeId);
			// Only the team's own routes, and no live stream: a chat has no place to hold one open.
			if (spec === undefined || spec.side !== "team" || spec.stream === true)
				throw new PortError("not-found", `no route ${routeId}`);
			const call = methodOf(api, spec);
			return run(() => call({ ...input }));
		},
	};
}
