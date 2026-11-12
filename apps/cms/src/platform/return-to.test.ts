import { describe, expect, it } from "vitest";
import { returnToFrom, safeReturnTo } from "./return-to";

describe("the page to land on after sign-in", () => {
	it("keeps a control-plane page with its brand", () => {
		expect(safeReturnTo("/admin/platform?brand=psizone")).toBe("/admin/platform?brand=psizone");
		expect(
			returnToFrom(`a=1; psi-cms-return=${encodeURIComponent("/admin/platform/ai?brand=eqsync")}`),
		).toBe("/admin/platform/ai?brand=eqsync");
	});
	it("refuses anything else (no open redirect)", () => {
		for (const bad of [
			"//evil.test",
			"https://evil.test/admin/platform",
			"/admin/platform/../users",
			"/admin/collections/users",
			"/admin/platform?x=<script>",
		]) {
			expect(safeReturnTo(bad)).toBeNull();
		}
		expect(returnToFrom(null)).toBeNull();
	});
});
