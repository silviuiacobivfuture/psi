import { version } from "@psi/scheduling/package.json";
import { describe, expect, it } from "vitest";
import { convexTarget } from "../contract/adapters";
import { StoreUnavailable } from "../types";
import { BUILT_FUNCTIONS, requireFunctions, servesAtLeast } from "./functions-version";
import { createRpc } from "./rpc";

describe("the functions a deployment serves, against the ones a build needs", () => {
	it("the same version, or any newer one, serves", () => {
		expect(servesAtLeast("0.28.0", "0.28.0")).toBe(true);
		expect(servesAtLeast("0.28.1", "0.28.0")).toBe(true);
		expect(servesAtLeast("0.29.0", "0.28.9")).toBe(true);
		expect(servesAtLeast("1.0.0", "0.99.99")).toBe(true);
		expect(servesAtLeast("0.10.0", "0.9.0")).toBe(true);
	});

	it("an older one does not, part by part and never as text", () => {
		expect(servesAtLeast("0.27.9", "0.28.0")).toBe(false);
		expect(servesAtLeast("0.28.0", "0.28.1")).toBe(false);
		expect(servesAtLeast("0.9.0", "0.10.0")).toBe(false);
		expect(servesAtLeast("0.99.99", "1.0.0")).toBe(false);
	});

	it("the build needs the version of @psi/scheduling it was built with", () => {
		expect(BUILT_FUNCTIONS).toBe(version);
	});
});

const target = await convexTarget();
if (target === undefined)
	console.warn("functions-version: no Convex backend (CONVEX_URL, PSI_CONVEX_DATA): skipped");

describe.skipIf(target === undefined)("readiness against a real deployment", () => {
	const rpc = () => {
		if (target === undefined) throw new Error("no backend");
		return createRpc({ url: target.url, serverKey: target.serverKey });
	};

	it("is ready when the deployment serves this build's functions", async () => {
		await expect(requireFunctions(rpc())).resolves.toBeUndefined();
	});

	it("is not ready while the deployment serves older functions than the build needs", async () => {
		await expect(requireFunctions(rpc(), "999.0.0")).rejects.toThrow(StoreUnavailable);
		await expect(requireFunctions(rpc(), "999.0.0")).rejects.toThrow("needs 999.0.0 or newer");
	});

	it("is not ready when the deployment cannot say (a wrong key: the call is refused)", async () => {
		if (target === undefined) throw new Error("no backend");
		const wrong = createRpc({ url: target.url, serverKey: "x".repeat(40) });
		await expect(requireFunctions(wrong)).rejects.toThrow(StoreUnavailable);
	});
});
