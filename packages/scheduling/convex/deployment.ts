import { v } from "convex/values";
import { version } from "../package.json";
import { query } from "./_generated/server";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

/**
 * Which functions this deployment serves: the version of @psi/scheduling they were deployed from. A service built
 * against a newer version is not ready until the functions it calls are here (scheduling-api's readiness), so a
 * rollout never sends a call to a function that is not deployed yet: the functions go first, the service follows.
 */
export const functionsVersion = query({
	args: { key: serverKeyValidator },
	handler: async (_ctx, args) => {
		requireServer(args.key);
		return { ok: true as const, version };
	},
});
