import { describe, expect, it } from "vitest";
import { ESTATE_LOCAL, estateInput, estateLinks } from "./estate";

const ALL = {
	PSIZONE_URL: "https://landing.psizone.ro",
	EQSYNC_URL: "https://eqsync.psizone.ro",
	HEMISYNC_URL: "https://hemisync.psizone.ro",
	BLOG_URL: "https://blog.psizone.ro",
};

/** Every site's origin comes from the environment; production never falls back to localhost. */
describe("estateInput", () => {
	it("uses the local dev ports outside production", () => {
		expect(estateInput({ NODE_ENV: "development" })).toEqual(ESTATE_LOCAL);
	});

	it("does not require a retired site's origin in production, and requires it once revived", () => {
		const { EQSYNC_URL: _, ...rest } = ALL;
		expect(() => estateInput({ NODE_ENV: "production", ...rest })).not.toThrow();
		expect(() => estateInput({ NODE_ENV: "production", ...rest }, [])).toThrow(/EQSYNC_URL/);
	});

	it("lists only live sites in the estate links, and every site once revived", () => {
		const labels = { psizone: "P", eqsync: "E", hemisync: "H", blog: "B" };
		const origins = estateInput({ NODE_ENV: "production", ...ALL });
		expect(estateLinks(origins, labels, "blog", "/").map((l) => l.site)).toEqual([
			"psizone",
			"hemisync",
			"blog",
		]);
		expect(estateLinks(origins, labels, "blog", "/", []).map((l) => l.site)).toEqual([
			"psizone",
			"eqsync",
			"hemisync",
			"blog",
		]);
	});

	it("reads every origin from the environment", () => {
		expect(estateInput({ NODE_ENV: "production", ...ALL })).toEqual({
			psizone: ALL.PSIZONE_URL,
			eqsync: ALL.EQSYNC_URL,
			hemisync: ALL.HEMISYNC_URL,
			blog: ALL.BLOG_URL,
		});
	});

	it("refuses to start in production with an origin missing, naming it", () => {
		const { BLOG_URL: _, ...rest } = ALL;
		expect(() => estateInput({ NODE_ENV: "production", ...rest })).toThrow(/BLOG_URL/);
	});
});
