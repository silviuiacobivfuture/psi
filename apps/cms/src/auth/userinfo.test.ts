import { describe, expect, it } from "vitest";
import { endpoints, toUser } from "./userinfo";

describe("endpoints", () => {
	it("derives Authentik's fixed endpoints from the application's issuer", () => {
		expect(endpoints("https://sso.psizone.ro/application/o/cms/")).toEqual({
			authorize: "https://sso.psizone.ro/application/o/authorize/",
			token: "https://sso.psizone.ro/application/o/token/",
			userinfo: "https://sso.psizone.ro/application/o/userinfo/",
		});
	});
});

describe("toUser", () => {
	it("keeps sub, a lower-cased e-mail and the name", () => {
		expect(toUser({ sub: "s1", email: "A@Psizone.ro", name: "Ana", groups: ["x"] })).toEqual({
			sub: "s1",
			email: "a@psizone.ro",
			name: "Ana",
		});
	});
	it("falls back to the username, then the e-mail, for the name", () => {
		expect(toUser({ sub: "s", email: "a@b.ro", preferred_username: "ana" }).name).toBe("ana");
		expect(toUser({ sub: "s", email: "a@b.ro" }).name).toBe("a@b.ro");
	});
	it.each([
		["no sub", { email: "a@b.ro" }],
		["empty sub", { sub: "", email: "a@b.ro" }],
		["no e-mail", { sub: "s" }],
		["not an e-mail", { sub: "s", email: "nope" }],
		["not an object", "token"],
	])("refuses %s", (_why, raw) => {
		expect(() => toUser(raw)).toThrow();
	});
});
