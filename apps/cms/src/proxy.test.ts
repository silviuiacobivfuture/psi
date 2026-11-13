import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { withApp } from "./brand/app-url";
import { BRAND_COOKIE, proxy } from "./proxy";

const at = (path: string, cookie?: string): NextRequest =>
	new NextRequest(new URL(path, "https://cms.psizone.ro"), {
		headers: cookie === undefined ? {} : { cookie },
	});

describe("the app in the address", () => {
	it("?app= stores the app for this render and the next ones", () => {
		const req = at("/admin/collections/articles?app=hemisync");
		const res = proxy(req);
		expect(req.cookies.get(BRAND_COOKIE)?.value).toBe("hemisync");
		expect(res.cookies.get(BRAND_COOKIE)?.value).toBe("hemisync");
	});

	it("keeps honouring the older ?brand= a site's /admin link sends", () => {
		expect(proxy(at("/admin/platform?brand=psizone")).cookies.get(BRAND_COOKIE)?.value).toBe(
			"psizone",
		);
	});

	it("?app=all clears the choice", () => {
		const req = at("/admin/collections/articles?app=all", `${BRAND_COOKIE}=blog`);
		const res = proxy(req);
		expect(req.cookies.get(BRAND_COOKIE)).toBeUndefined();
		expect(res.cookies.get(BRAND_COOKIE)?.value).toBe("");
	});

	it("ignores an unknown or retired app and leaves the cookie as it was", () => {
		for (const app of ["acme", "eqsync"]) {
			const req = at(`/admin/collections/articles?app=${app}`, `${BRAND_COOKIE}=blog`);
			const res = proxy(req);
			expect(req.cookies.get(BRAND_COOKIE)?.value).toBe("blog");
			expect(res.cookies.get(BRAND_COOKIE)).toBeUndefined();
		}
	});

	it("withApp writes ?app=, drops the older ?brand= and keeps the rest", () => {
		expect(
			withApp("https://cms.psizone.ro/admin/collections/articles?page=2&brand=x", "blog"),
		).toBe("https://cms.psizone.ro/admin/collections/articles?page=2&app=blog");
		expect(withApp("https://cms.psizone.ro/admin", "")).toBe(
			"https://cms.psizone.ro/admin?app=all",
		);
	});
});
