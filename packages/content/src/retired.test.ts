import { describe, expect, it } from "vitest";
import { isRetired, live, RETIRED_SITES } from "./retired";

describe("the retirement switch", () => {
	it("retires EQ-SYNC, the owner's order of 2026-11-12", () => {
		expect(RETIRED_SITES).toEqual(["eqsync"]);
		expect(isRetired("eqsync")).toBe(true);
		expect(isRetired("psizone")).toBe(false);
	});

	it("drops the retired members, keeping order, and restores them with an empty list", () => {
		const all = ["psizone", "eqsync", "hemisync", "blog"] as const;
		expect(live(all)).toEqual(["psizone", "hemisync", "blog"]);
		expect(live(all, [])).toEqual(all);
		expect(live([], ["eqsync"])).toEqual([]);
		expect(live(["eqsync"])).toEqual([]);
	});
});
