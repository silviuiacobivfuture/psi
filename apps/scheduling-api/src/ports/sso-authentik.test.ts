import { describe, expect, it } from "vitest";
import { SsoUnavailable } from "./sso";
import { type AuthentikOptions, createAuthentikSso } from "./sso-authentik";

type Seen = { method: string; url: string; auth: string | null; body: unknown };
const USER = {
	pk: 41,
	username: "maria@example.test",
	email: "Maria@Example.test",
	is_active: true,
	uid: "hashed-uid-41",
};

function build(
	answers: Array<{ status?: number; body: unknown } | "down">,
	over: Partial<AuthentikOptions> = {},
) {
	const seen: Seen[] = [];
	let n = 0;
	const fetch: typeof globalThis.fetch = (input, init) => {
		seen.push({
			method: String(init?.method),
			url: String(input),
			auth: new Headers(init?.headers).get("authorization"),
			body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
		});
		const answer = answers[n++];
		if (answer === undefined || answer === "down") return Promise.reject(new Error("connect"));
		return Promise.resolve(
			new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 }),
		);
	};
	const sso = createAuthentikSso({
		url: "https://auth.test/",
		token: "tok",
		customersGroup: "customers",
		subMode: "hashed_user_id",
		fetch,
		...over,
	});
	return { sso, seen };
}

describe("Authentik's admin API", () => {
	it("finds an account by e-mail, case-insensitively, with the token, and gives the subject a site sees", async () => {
		const { sso, seen } = build([{ body: { results: [USER] } }]);
		expect(await sso.findByEmail("maria@example.test")).toEqual({
			userId: "41",
			subject: "hashed-uid-41",
			email: "Maria@Example.test",
			active: true,
		});
		expect(seen[0]).toMatchObject({
			method: "GET",
			url: "https://auth.test/api/v3/core/users/?email=maria%40example.test",
			auth: "Bearer tok",
		});
	});
	it("finds nothing when no user has exactly that address", async () => {
		const { sso } = build([{ body: { results: [{ ...USER, email: "other@example.test" }] } }]);
		expect(await sso.findByEmail("maria@example.test")).toBeUndefined();
	});
	it("creates the user in the customers group, never a staff one", async () => {
		const { sso, seen } = build([
			{ body: { results: [{ pk: "g-1", name: "customers" }] } },
			{ status: 201, body: USER },
		]);
		const made = await sso.create({ email: "maria@example.test", name: "Maria" });
		expect(made.userId).toBe("41");
		expect(seen[1]).toMatchObject({
			method: "POST",
			url: "https://auth.test/api/v3/core/users/",
			body: {
				username: "maria@example.test",
				email: "maria@example.test",
				name: "Maria",
				is_active: true,
				groups: ["g-1"],
				path: "customers",
			},
		});
	});
	it("refuses to create when the customers group does not exist, and creates nothing", async () => {
		const { sso, seen } = build([{ body: { results: [] } }]);
		await expect(sso.create({ email: "a@example.test", name: "A" })).rejects.toBeInstanceOf(
			SsoUnavailable,
		);
		expect(seen).toHaveLength(1);
	});
	it("the subject follows the provider's sub mode", async () => {
		for (const [subMode, expected] of [
			["user_id", "41"],
			["user_username", "maria@example.test"],
			["user_email", "Maria@Example.test"],
		] as const) {
			const { sso } = build([{ body: { results: [USER] } }], { subMode });
			expect((await sso.findByEmail("maria@example.test"))?.subject).toBe(expected);
		}
	});
	it("asks for a recovery link, and switches an account off without deleting it", async () => {
		const { sso, seen } = build([
			{ status: 200, body: { link: "https://auth.test/if/flow/recover/?token=abc" } },
			{ body: {} },
		]);
		expect(await sso.recoveryLink("41")).toBe("https://auth.test/if/flow/recover/?token=abc");
		await sso.deactivate("41");
		expect(seen.map((s) => [s.method, s.url])).toEqual([
			["POST", "https://auth.test/api/v3/core/users/41/recovery/"],
			["PATCH", "https://auth.test/api/v3/core/users/41/"],
		]);
		expect(seen[1]?.body).toEqual({ is_active: false });
	});
	it("an unreachable provider, a refusal and an answer of the wrong shape are all `SsoUnavailable`", async () => {
		await expect(build(["down"]).sso.findByEmail("a@example.test")).rejects.toBeInstanceOf(
			SsoUnavailable,
		);
		await expect(
			build([{ status: 403, body: {} }]).sso.findByEmail("a@example.test"),
		).rejects.toBeInstanceOf(SsoUnavailable);
		await expect(
			build([{ body: { results: [{ pk: "x" }] } }]).sso.findByEmail("a@example.test"),
		).rejects.toBeInstanceOf(SsoUnavailable);
		await expect(
			build([{ body: { link: "not a url" } }]).sso.recoveryLink("41"),
		).rejects.toBeInstanceOf(SsoUnavailable);
	});
	it("an id with a slash in it cannot reach another path", async () => {
		const { sso, seen } = build([{ body: { link: "https://auth.test/x" } }]);
		await sso.recoveryLink("41/../../x");
		expect(seen[0]?.url).toBe("https://auth.test/api/v3/core/users/41%2F..%2F..%2Fx/recovery/");
	});
});
