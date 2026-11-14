import { FUNCTIONS_HASH } from "@psi/scheduling/functions-hash";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { convexTarget } from "../contract/adapters";
import { StoreUnavailable } from "../types";
import { functionsGate } from "./functions-hash";
import { createRpc, type Rpc } from "./rpc";

/**
 * Against a real local deployment (CONVEX_URL, PSI_CONVEX_DATA), which must hold this commit's functions
 * (`scripts/convex.sh deploy --yes` in packages/scheduling).
 */
const target = await convexTarget();
if (target === undefined)
	console.warn("functions-hash: no Convex backend (CONVEX_URL, PSI_CONVEX_DATA): skipped");

describe.skipIf(target === undefined)("readiness waits for this build's functions", () => {
	const rpc = (key?: string) => {
		if (target === undefined) throw new Error("no backend");
		return createRpc({ url: target.url, serverKey: key ?? target.serverKey });
	};

	it("is ready when the deployment serves the functions this service was built with", async () => {
		await expect(functionsGate(rpc()).check()).resolves.toBeUndefined();
	});

	it("is not ready while the deployment serves other functions, and says which", async () => {
		const gate = functionsGate(rpc(), "0123456789abcdef");
		await expect(gate.check()).rejects.toThrow(StoreUnavailable);
		await expect(gate.check()).rejects.toThrow(
			`serves functions ${FUNCTIONS_HASH}; this service was built with 0123456789abcdef`,
		);
	});

	it("is not ready when the deployment cannot say (the call is refused)", async () => {
		await expect(functionsGate(rpc("x".repeat(40))).check()).rejects.toThrow(StoreUnavailable);
	});

	it("once ready, stays ready for the life of the process, asking no more", async () => {
		let calls = 0;
		const inner = rpc();
		const counting: Rpc = {
			...inner,
			query<T>(fn: string, args: Readonly<Record<string, unknown>>, schema: z.ZodType<T>) {
				calls += 1;
				return inner.query(fn, args, schema);
			},
		};
		const gate = functionsGate(counting);
		await gate.check();
		await gate.check();
		await gate.check();
		expect(calls).toBe(1);
	});
});
