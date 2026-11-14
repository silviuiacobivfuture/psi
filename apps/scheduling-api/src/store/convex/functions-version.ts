import { version as built } from "@psi/scheduling/package.json";
import { z } from "zod";
import { StoreUnavailable } from "../types";
import type { Rpc } from "./rpc";

const Version = z.string().regex(/^\d+\.\d+\.\d+$/);
const Answer = z.object({ ok: z.literal(true), version: Version });

/** The version of @psi/scheduling this service was built with: the functions it calls are that version's. */
export const BUILT_FUNCTIONS: string = Version.parse(built);

const parts = (v: string): number[] => v.split(".").map(Number);

/** Whether `served` is the same as or newer than `needed` (major, minor, patch). */
export function servesAtLeast(served: string, needed: string): boolean {
	const a = parts(served);
	const b = parts(needed);
	for (let i = 0; i < 3; i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x !== y) return x > y;
	}
	return true;
}

/**
 * Throws `StoreUnavailable` unless the deployment serves the functions this service was built against (or newer). The
 * readiness probe asks it, so a new service pod takes no traffic until the scheduling functions it calls have been
 * deployed (scheduling-deploy), and the old pods keep serving meanwhile: the functions go first, the service follows.
 */
export async function requireFunctions(rpc: Rpc, needed: string = BUILT_FUNCTIONS): Promise<void> {
	let served: string;
	try {
		served = (await rpc.query("deployment:functionsVersion", {}, Answer)).version;
	} catch (error) {
		throw new StoreUnavailable(
			`the store does not say which functions it serves (${error instanceof Error ? error.message : "unknown"})`,
		);
	}
	if (!servesAtLeast(served, needed))
		throw new StoreUnavailable(
			`the store serves functions ${served}; this service needs ${needed} or newer`,
		);
}
