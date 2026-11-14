import { beforeEach, describe, expect, it } from "vitest";
import { HELD_KEPT, SETTLE_MS } from "./authz/held-kept";
import { AuthzUnavailable } from "./authz/port";
import { createWorld, type Populated } from "./testing/populate";

/**
 * A member's capabilities cost the whole catalogue (~480 OpenFGA checks). The service keeps that part between requests
 * while the rows it derives from are unchanged: a change made through the service shows at once, a tuple written
 * behind its back within a minute, and a row changed moments ago is never kept (its tuples may still be on the way).
 */
const A = "/v1/apps/psizone";
let w: Populated;
/** How many times the whole catalogue was asked of the authorizer. */
let catalogueAsks = 0;

beforeEach(async () => {
	w = await createWorld();
	catalogueAsks = 0;
	const inner = w.authz.checkMany.bind(w.authz);
	w.authz.checkMany = (questions) => {
		if (questions.length > 400) catalogueAsks += 1;
		return inner(questions);
	};
	// Everything the world was made with is long settled.
	w.clock.now += SETTLE_MS + 1;
});

async function as(subject: string, method: string, path: string, body?: unknown) {
	const res = await w.app.request(`${A}${path}`, {
		method,
		headers: {
			authorization: `Bearer ${await w.issuer.mint(subject)}`,
			...(body === undefined ? {} : { "content-type": "application/json" }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const caps = async (subject: string) => {
	const r = await as(subject, "GET", "/me");
	expect(r.status).toBe(200);
	return r.json as { permissions: Record<string, string[]>; platformAdmin: boolean };
};

describe("a member's capabilities are kept while what they derive from is unchanged", () => {
	it("asked once, then served the same until a minute has passed", async () => {
		const first = await caps("rita");
		const second = await caps("rita");
		expect(catalogueAsks).toBe(1);
		expect(second).toEqual(first);
		w.clock.now += HELD_KEPT.ttlMs + 1;
		expect(await caps("rita")).toEqual(first);
		expect(catalogueAsks).toBe(2);
	});

	it("each member's own: Olga's kept answer is never Rita's", async () => {
		const olga = await caps("olga");
		const rita = await caps("rita");
		expect(catalogueAsks).toBe(2);
		expect(rita.permissions).not.toEqual(olga.permissions);
		await caps("olga");
		await caps("rita");
		expect(catalogueAsks).toBe(2);
	});

	it("a denial given through the service shows at once, and its withdrawal too", async () => {
		expect((await caps("rita")).permissions.clients_view).toContain("all");
		expect(
			(
				await as("olga", "PUT", "/members/rita/overrides", {
					grant: [],
					deny: ["clients_view_all"],
				})
			).status,
		).toBe(200);
		expect((await caps("rita")).permissions.clients_view ?? []).not.toContain("all");
		await as("olga", "PUT", "/members/rita/overrides", { grant: [], deny: [] });
		expect((await caps("rita")).permissions.clients_view).toContain("all");
	});

	it("a role's permission taken away through the service shows at once for everyone holding it", async () => {
		expect((await caps("rita")).permissions.clients_view).toContain("all");
		await caps("rita");
		expect(catalogueAsks).toBe(1);
		const res = await as("olga", "PUT", `/roles/${w.ids.roles.reception}/permissions`, {
			permissions: [],
		});
		expect(res.status).toBe(200);
		expect((await caps("rita")).permissions.clients_view ?? []).not.toContain("all");
		expect(catalogueAsks).toBe(2);
	});

	it("the estate administrator's standing, changed in the tuples alone, shows at once", async () => {
		expect((await caps("rita")).platformAdmin).toBe(false);
		await w.platformAdmin("rita", true);
		const now = await caps("rita");
		expect(now.platformAdmin).toBe(true);
		expect(catalogueAsks).toBe(2);
	});

	it("a row changed moments ago is not kept: asked again until it has settled", async () => {
		await as("olga", "PUT", "/members/rita/overrides", { grant: [], deny: [] });
		await caps("rita");
		await caps("rita");
		expect(catalogueAsks).toBe(2);
		w.clock.now += SETTLE_MS;
		await caps("rita");
		await caps("rita");
		expect(catalogueAsks).toBe(3);
	});

	it("a failed ask is not kept: the next request asks again", async () => {
		const inner = w.authz.checkMany;
		let failing = true;
		w.authz.checkMany = (questions) => {
			if (failing && questions.length > 400) {
				failing = false;
				return Promise.reject(new AuthzUnavailable("authorizer down"));
			}
			return inner(questions);
		};
		expect((await as("rita", "GET", "/me")).status).toBe(503);
		await caps("rita");
		await caps("rita");
		expect(catalogueAsks).toBe(1);
	});
});
