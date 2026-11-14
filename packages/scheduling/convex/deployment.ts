import { FUNCTIONS_HASH } from "../src/functions-hash.generated";
import { query } from "./_generated/server";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

/**
 * Which functions this deployment serves: the hash of the sources they were deployed from
 * (scripts/functions-hash.ts). A service built from other sources is not ready until these are its own
 * (scheduling-api's readiness), so a rollout never sends a call to a function that is not deployed yet: the functions
 * go first, the service follows.
 */
export const functionsHash = query({
	args: { key: serverKeyValidator },
	handler: async (_ctx, args) => {
		requireServer(args.key);
		return { ok: true as const, hash: FUNCTIONS_HASH };
	},
});
