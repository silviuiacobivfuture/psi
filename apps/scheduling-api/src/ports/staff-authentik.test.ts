import { describe, expect, it } from "vitest";
import { SsoUnavailable } from "./sso";
import { createAuthentikStaff } from "./staff-authentik";

type Seen = { method: string; url: string; body: unknown };
const STAFF = { pk: "g-staff", name: "app-clinic-member" };
const CUSTOMERS = { pk: "g-cust", name: "app-clinic-customer" };
const user = (pk: number, extra: Record<string, unknown> = {}) => ({
	pk,
	username: `u${pk}`,
	name: `Persoana ${pk}`,
	email: `u${pk}@example.test`,
	is_active: true,
	uid: `uid-${pk}`,
	type: "internal",
	groups_obj: [STAFF],
	...extra,
});

function build(answers: Array<{ status?: number; body?: unknown } | "down">) {
	const seen: Seen[] = [];
	let n = 0;
	const fetch: typeof globalThis.fetch = (input, init) => {
		seen.push({
			method: String(init?.method),
			url: String(input),
			body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
		});
		const answer = answers[n++];
		if (answer === undefined || answer === "down") return Promise.reject(new Error("connect"));
		return Promise.resolve(
			new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
				status: answer.status ?? 200,
			}),
		);
	};
	const staff = createAuthentikStaff({
		url: "https://auth.test",
		token: "tok",
		staffGroup: STAFF.name,
		customersGroup: CUSTOMERS.name,
		subMode: "hashed_user_id",
		fetch,
	});
	return { staff, seen };
}

describe("the staff group through Authentik", () => {
	it("searches the staff group by name and e-mail, and keeps only its people even if the filter was ignored", async () => {
		const { staff, seen } = build([
			{
				body: {
					results: [
						user(1),
						user(2, { groups_obj: [CUSTOMERS] }),
						user(3, { type: "service_account" }),
						user(4, { groups_obj: null }),
						user(5, { is_active: false, groups_obj: [STAFF, CUSTOMERS] }),
					],
				},
			},
		]);
		const found = await staff.search("pers", 20);
		expect(found.map((a) => a.userId)).toEqual(["1", "5"]);
		expect(found[1]).toMatchObject({ active: false, staff: true, customer: true });
		const url = new URL(seen[0]?.url ?? "");
		expect(url.pathname).toBe("/api/v3/core/users/");
		expect(url.searchParams.get("search")).toBe("pers");
		expect(url.searchParams.get("groups_by_name")).toBe("app-clinic-member");
		expect(url.searchParams.get("include_groups")).toBe("true");
		expect(url.searchParams.get("page_size")).toBe("20");
	});

	it("caps what it asks for and what it answers", async () => {
		const { staff, seen } = build([{ body: { results: [user(1), user(2), user(3)] } }]);
		expect(await staff.search("p", 2)).toHaveLength(2);
		expect(new URL(seen[0]?.url ?? "").searchParams.get("page_size")).toBe("2");
	});

	it("finds an address in any group and says which, case-insensitively", async () => {
		const { staff } = build([
			{ body: { results: [user(7, { email: "Ana@Example.test", groups_obj: [CUSTOMERS] })] } },
		]);
		expect(await staff.find("ana@example.test")).toMatchObject({
			userId: "7",
			subject: "uid-7",
			staff: false,
			customer: true,
		});
	});

	it("makes a new account in the staff group, active with no password, under the staff path", async () => {
		const { staff, seen } = build([
			{ body: { results: [STAFF] } },
			{ body: user(9, { groups_obj: undefined }) },
		]);
		expect(await staff.create({ email: "nou@example.test", name: "Nou" })).toMatchObject({
			userId: "9",
			staff: true,
		});
		expect(seen[1]).toMatchObject({
			method: "POST",
			url: "https://auth.test/api/v3/core/users/",
			body: {
				username: "nou@example.test",
				email: "nou@example.test",
				name: "Nou",
				is_active: true,
				groups: ["g-staff"],
				path: "staff",
			},
		});
		expect(JSON.stringify(seen[1]?.body)).not.toContain("password");
	});

	it("puts an existing account into the staff group (an empty answer is fine)", async () => {
		const { staff, seen } = build([{ body: { results: [STAFF] } }, { status: 204 }]);
		await staff.join("12");
		expect(seen[1]).toMatchObject({
			method: "POST",
			url: "https://auth.test/api/v3/core/groups/g-staff/add_user/",
			body: { pk: 12 },
		});
	});

	it("takes an account out of the staff group again", async () => {
		const { staff, seen } = build([{ body: { results: [STAFF] } }, { status: 204 }]);
		await staff.leave("12");
		expect(seen[1]).toMatchObject({
			method: "POST",
			url: "https://auth.test/api/v3/core/groups/g-staff/remove_user/",
			body: { pk: 12 },
		});
	});

	it("reads whether the account ever signed in", async () => {
		const never = build([{ body: { last_login: null } }]);
		expect(await never.staff.lastLogin("5")).toBeUndefined();
		expect(never.seen[0]?.url).toBe("https://auth.test/api/v3/core/users/5/");
		const once = build([{ body: { last_login: "2026-11-14T08:00:00+00:00" } }]);
		expect(await once.staff.lastLogin("5")).toBe(Date.UTC(2026, 10, 14, 8));
	});

	it("a staff group that does not exist, a refusal or no answer is SsoUnavailable", async () => {
		await expect(
			build([{ body: { results: [] } }]).staff.create({ email: "a@b.c", name: "A" }),
		).rejects.toBeInstanceOf(SsoUnavailable);
		await expect(build([{ status: 403, body: {} }]).staff.search("ab", 5)).rejects.toBeInstanceOf(
			SsoUnavailable,
		);
		await expect(build(["down"]).staff.find("a@b.c")).rejects.toBeInstanceOf(SsoUnavailable);
		await expect(build([{ body: { results: "x" } }]).staff.find("a@b.c")).rejects.toBeInstanceOf(
			SsoUnavailable,
		);
	});
});
