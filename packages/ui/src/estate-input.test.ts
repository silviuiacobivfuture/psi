import { describe, expect, it } from "vitest";
import { ESTATE_LOCAL, estateInput } from "./estate";

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
