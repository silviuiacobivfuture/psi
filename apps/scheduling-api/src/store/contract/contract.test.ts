import { afterAll, beforeAll, describe } from "vitest";
import { convexEnv, convexTarget, memoryEnv } from "./adapters";
import type { ContractEnv, ContractSection } from "./env";
import { SECTIONS } from "./sections";

/**
 * THE CONTRACT SUITE: the same behaviours, asserted on every adapter of the StorePort. Memory is the reference; the
 * Convex adapter must answer identically. The Convex run needs a backend (see adapters.ts) and is skipped, loudly,
 * without one.
 */
const target = await convexTarget();
if (target === undefined)
	console.warn(
		"store contract: no Convex backend (CONVEX_URL, PSI_CONVEX_DATA): the Convex run is skipped",
	);

function run(label: string, make: () => ContractEnv, enabled: boolean): void {
	describe.skipIf(!enabled)(`store contract on ${label}`, () => {
		let env: ContractEnv;
		beforeAll(() => {
			env = make();
		});
		// Dropping every throwaway tenant the sections made, one by one: on a loaded workstation more than the default 10 s.
		afterAll(async () => {
			await env.cleanup();
		}, 120_000);
		const get = (): ContractEnv => env;
		for (const section of SECTIONS as ReadonlyArray<ContractSection>) section(get);
	});
}

run("memory", memoryEnv, true);
run(
	"convex",
	() => convexEnv(target ?? { url: "", serverKey: "", adminKey: "" }),
	target !== undefined,
);
