import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { functionsHash, HASH_FILE, hashFileText } from "../../scripts/functions-hash";
import { FUNCTIONS_HASH } from "../functions-hash.generated";

describe("the functions' identity is the hash of the sources they are built from", () => {
	it("is current: run `pnpm --filter @psi/scheduling functions-hash` after changing convex/ or src/", () => {
		expect(FUNCTIONS_HASH, "src/functions-hash.generated.ts is stale").toBe(functionsHash());
		expect(readFileSync(HASH_FILE, "utf8")).toBe(hashFileText(functionsHash()));
	});

	it("is sixteen hex characters, and the deployment answers it", () => {
		expect(FUNCTIONS_HASH).toMatch(/^[0-9a-f]{16}$/);
		const deployment = readFileSync(new URL("../../convex/deployment.ts", import.meta.url), "utf8");
		expect(deployment).toContain(
			'import { FUNCTIONS_HASH } from "../src/functions-hash.generated"',
		);
		expect(deployment).toContain("hash: FUNCTIONS_HASH");
	});
});
