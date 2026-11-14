import { FUNCTIONS_HASH } from "@psi/scheduling/functions-hash";
import { z } from "zod";
import { StoreUnavailable } from "../types";
import type { Rpc } from "./rpc";

const Answer = z.object({ ok: z.literal(true), hash: z.string().regex(/^[0-9a-f]{16}$/) });

export interface FunctionsGate {
	/**
	 * Throws `StoreUnavailable` until the deployment serves the functions this service was built with (the same hash).
	 * Once it has, it never throws again for this process: functions only ever gain, so a later deploy of newer ones
	 * leaves a running pod serving while its successors start.
	 */
	check(): Promise<void>;
}

/**
 * The readiness half of the deploy order: a new service pod takes no traffic until scheduling-deploy has deployed the
 * functions of its own commit (the old pods keep serving meanwhile, the rollout being maxUnavailable 0).
 */
export function functionsGate(rpc: Rpc, built: string = FUNCTIONS_HASH): FunctionsGate {
	let seen = false;
	return {
		async check() {
			if (seen) return;
			let served: string;
			try {
				served = (await rpc.query("deployment:functionsHash", {}, Answer)).hash;
			} catch (error) {
				throw new StoreUnavailable(
					`the store does not say which functions it serves (${error instanceof Error ? error.message : "unknown"})`,
				);
			}
			if (served !== built)
				throw new StoreUnavailable(
					`the store serves functions ${served}; this service was built with ${built}`,
				);
			seen = true;
		},
	};
}
