import { describe, expect, it } from "vitest";
import { endpoints, tokenReply, toUser } from "./userinfo";

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
	it("keeps sub, a lower-cased e-mail, the name and the directory groups", () => {
		expect(toUser({ sub: "s1", email: "A@Psizone.ro", name: "Ana", groups: ["x"] })).toEqual({
			sub: "s1",
			email: "a@psizone.ro",
			name: "Ana",
			directoryGroups: ["x"],
		});
		expect(toUser({ sub: "s1", email: "a@b.ro" }).directoryGroups).toEqual([]);
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

describe("tokenReply", () => {
	it("keeps the access token and the refresh token offline_access asked for", () => {
		expect(
			tokenReply({
				access_token: "at",
				refresh_token: "rt",
				token_type: "Bearer",
				expires_in: 300,
			}),
		).toEqual({ accessToken: "at", refreshToken: "rt" });
	});
	it("no refresh token is null: that person is not checked until the next sign-in", () => {
		expect(tokenReply({ access_token: "at" })).toEqual({
			accessToken: "at",
			refreshToken: null,
		});
		expect(tokenReply({ access_token: "at", refresh_token: "" }).refreshToken).toBeNull();
	});
	it.each([
		[
			"an error reply",
			{ error: "invalid_grant", error_description: "x" },
			"error,error_description",
		],
		[
			"an empty access token",
			{ access_token: "", refresh_token: "rt" },
			"access_token,refresh_token",
		],
		["not an object", "nope", "string"],
		["null", null, "object"],
	])("refuses %s, naming the keys and never a value", (_l, raw, keys) => {
		expect(() => tokenReply(raw)).toThrow(
			`the directory's token reply has no access token (keys: ${keys})`,
		);
		expect(() => tokenReply(raw)).not.toThrow(/rt|invalid_grant/);
	});
});
