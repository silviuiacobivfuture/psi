import { describe, expect, it } from "vitest";
import { memoryStores } from "./memory";

describe("finding accounts by e-mail (the privacy officer's search)", () => {
	it("matches case-insensitively, newest first, and only that address", async () => {
		const s = memoryStores();
		const id = (subject: string, email: string | null) => ({
			issuer: "https://i/",
			subject,
			email,
			name: null,
		});
		await s.accounts.signedIn(id("a", "Ana@Psi.test"), 1);
		await s.accounts.signedIn(id("b", "ana@psi.test"), 2);
		await s.accounts.signedIn(id("c", "ion@psi.test"), 3);
		await s.accounts.signedIn(id("d", null), 4);
		expect((await s.accounts.byEmail(" ANA@psi.test ")).map((r) => r.subject)).toEqual(["b", "a"]);
		expect(await s.accounts.byEmail("nobody@psi.test")).toEqual([]);
		await s.accounts.erase("b");
		expect((await s.accounts.byEmail("ana@psi.test")).map((r) => r.subject)).toEqual(["a"]);
	});
});
