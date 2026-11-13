import { describe, expect, it } from "vitest";
import { createAccess, reaches } from "./access";
import {
	appLink,
	coordinatorLink,
	memberLink,
	ownerLink,
	parentLink,
	roleAppLink,
	roleGrant,
	roleHolder,
	treatingLink,
} from "./links";
import { createLiveAuthz } from "./live";
import { createMemoryAuthz, platformAdminTuples } from "./memory";
import { AuthzUnavailable, type Tuple } from "./port";

/** Two apps, a client treated by Dora in `psizone`, a client of nobody, and one role per scope. */
function world(extra: Tuple[] = []): { tuples: Tuple[] } {
	const tuples: Tuple[] = [
		{ user: "platform:psi", relation: "parent_platform", object: "sched_app:psizone" },
		{ user: "platform:psi", relation: "parent_platform", object: "sched_app:hemisync" },
		appLink("sched_calendar", "pdora", "psizone"),
		ownerLink("pdora", "dora"),
		appLink("sched_calendar", "pelena", "psizone"),
		ownerLink("pelena", "elena"),
		coordinatorLink("pdora", "cora"),
		coordinatorLink("pelena", "cora"),
		appLink("sched_client", "c-dora", "psizone"),
		treatingLink("c-dora", "pdora"),
		appLink("sched_client", "c-elena", "psizone"),
		treatingLink("c-elena", "pelena"),
		appLink("sched_client", "c-hemi", "hemisync"),
		appLink("sched_appointment", "a-dora", "psizone"),
		parentLink("sched_appointment", "a-dora", "calendar", "sched_calendar", "pdora"),
		appLink("sched_package", "k-dora", "psizone"),
		parentLink("sched_package", "k-dora", "client", "sched_client", "c-dora"),
		roleAppLink("r-all", "psizone"),
		roleGrant("r-all", "psizone", "clients_view_all"),
		roleGrant("r-all", "psizone", "packages_view_all"),
		roleGrant("r-own", "psizone", "clients_view_own"),
		roleGrant("r-own", "psizone", "packages_view_own"),
		roleGrant("r-own", "psizone", "appointments_view_own"),
		roleGrant("r-assigned", "psizone", "clients_view_assigned"),
		roleGrant("r-hemi", "hemisync", "clients_view_all"),
		memberLink("psizone", "rita"),
		roleHolder("r-all", "rita"),
		memberLink("psizone", "dora"),
		roleHolder("r-own", "dora"),
		memberLink("psizone", "cora"),
		roleHolder("r-assigned", "cora"),
		memberLink("hemisync", "hugo"),
		roleHolder("r-hemi", "hugo"),
		...platformAdminTuples("root"),
		...extra,
	];
	return { tuples };
}
const accessOf = (tuples: Tuple[], denied: string[] = []) =>
	createAccess(createMemoryAuthz(tuples), () => Promise.resolve(new Set(denied)));

describe("scope comes from relations, not from code", () => {
	const { tuples } = world();
	const access = accessOf(tuples);

	it("a role with the all scope reaches every client of its app", async () => {
		expect(await access.reach("rita", "psizone", "clients_view", "sched_client")).toEqual({
			kind: "all",
		});
		expect(await access.canOn("rita", "psizone", "clients_view", "sched_client", "c-elena")).toBe(
			true,
		);
	});

	it("the own scope reaches the clients the person's calendar treats, and nobody else's", async () => {
		const reach = await access.reach("dora", "psizone", "clients_view", "sched_client");
		expect(reach.kind === "ids" && [...reach.ids]).toEqual(["c-dora"]);
		expect(await access.canOn("dora", "psizone", "clients_view", "sched_client", "c-dora")).toBe(
			true,
		);
		expect(await access.canOn("dora", "psizone", "clients_view", "sched_client", "c-elena")).toBe(
			false,
		);
		expect(await access.canAll("dora", "psizone", "clients_view")).toBe(false);
	});

	it("the assigned scope reaches the clients of the practitioners the person coordinates", async () => {
		const reach = await access.reach("cora", "psizone", "clients_view", "sched_client");
		expect(reach.kind === "ids" && [...reach.ids].sort()).toEqual(["c-dora", "c-elena"]);
	});

	it("scope flows to what hangs off a client: packages and appointments", async () => {
		expect(await access.canOn("dora", "psizone", "packages_view", "sched_package", "k-dora")).toBe(
			true,
		);
		expect(await access.canOn("cora", "psizone", "packages_view", "sched_package", "k-dora")).toBe(
			false,
		);
		expect(
			await access.canOn("dora", "psizone", "appointments_view", "sched_appointment", "a-dora"),
		).toBe(true);
		expect(
			await access.canOn("elena", "psizone", "appointments_view", "sched_appointment", "a-dora"),
		).toBe(false);
	});

	it("a person with no role reaches nothing", async () => {
		expect(await access.reach("nobody", "psizone", "clients_view", "sched_client")).toEqual({
			kind: "none",
		});
	});

	it("an app is a closed world: a role in another app grants nothing here", async () => {
		expect(await access.isMember("hugo", "psizone")).toBe(false);
		expect(await access.canOn("hugo", "psizone", "clients_view", "sched_client", "c-dora")).toBe(
			false,
		);
		expect(await access.canOn("hugo", "hemisync", "clients_view", "sched_client", "c-hemi")).toBe(
			true,
		);
		expect(await access.canOn("hugo", "hemisync", "clients_view", "sched_client", "c-dora")).toBe(
			false,
		);
	});

	it("membership is its own fact", async () => {
		expect(await access.isMember("rita", "psizone")).toBe(true);
		expect(await access.isMember("rita", "hemisync")).toBe(false);
	});

	it("only the estate's platform administrator is one, and holds the app-management permissions only", async () => {
		expect(await access.isPlatformAdmin("root")).toBe(true);
		expect(await access.isPlatformAdmin("rita")).toBe(false);
		expect(await access.canAll("root", "psizone", "roles_edit")).toBe(true);
		expect(await access.canAll("root", "psizone", "clients_clinical_view")).toBe(false);
		expect(await access.isMember("root", "psizone")).toBe(true);
	});

	it("an individual denial refuses the permission in every scope, before OpenFGA", async () => {
		const denied = accessOf(tuples, ["clients_view"]);
		expect(await denied.reach("rita", "psizone", "clients_view", "sched_client")).toEqual({
			kind: "none",
		});
		expect(await denied.canOn("dora", "psizone", "clients_view", "sched_client", "c-dora")).toBe(
			false,
		);
		expect(await denied.canAll("rita", "psizone", "clients_view")).toBe(false);
	});

	it("an individual grant adds a relation on top of the roles", async () => {
		const granted = accessOf(
			world([{ user: "user:dora", relation: "clients_view_all", object: "sched_app:psizone" }])
				.tuples,
		);
		expect(await granted.reach("dora", "psizone", "clients_view", "sched_client")).toEqual({
			kind: "all",
		});
	});

	it("deleting the role's tuple revokes at once", async () => {
		const authz = createMemoryAuthz(tuples);
		const a = createAccess(authz, () => Promise.resolve(new Set()));
		expect(await a.canAll("rita", "psizone", "clients_view")).toBe(true);
		await authz.write({ writes: [], deletes: [roleGrant("r-all", "psizone", "clients_view_all")] });
		expect(await a.canAll("rita", "psizone", "clients_view")).toBe(false);
	});

	it("reaches() reads a reach", () => {
		expect(reaches({ kind: "all" }, "x")).toBe(true);
		expect(reaches({ kind: "ids", ids: new Set(["x"]) }, "x")).toBe(true);
		expect(reaches({ kind: "ids", ids: new Set(["x"]) }, "y")).toBe(false);
		expect(reaches({ kind: "none" }, "x")).toBe(false);
	});

	it("refuses an unknown permission key rather than answering", async () => {
		await expect(access.canAll("rita", "psizone", "clients_levitate")).rejects.toThrow(
			"unknown permission key",
		);
	});
});

describe("the live adapter", () => {
	const calls: { url: string; body: Record<string, unknown> }[] = [];
	const answer =
		(status: number, body: unknown) =>
		async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
			return new Response(JSON.stringify(body), { status });
		};
	const build = (fetch: typeof globalThis.fetch, now = () => 1_000_000) =>
		createLiveAuthz({
			readUrl: "http://fga:8081/",
			writeUrl: "http://fga-admin:8080",
			storeId: "S",
			modelId: "M1",
			token: "tok",
			fetch,
			now,
		});

	it("pins the model id on every call and supplies `now` itself", async () => {
		calls.length = 0;
		await build(answer(200, { allowed: true })).check("user:a", "member", "sched_app:x");
		expect(calls[0]?.url).toBe("http://fga:8081/stores/S/check");
		expect(calls[0]?.body).toMatchObject({
			authorization_model_id: "M1",
			tuple_key: { user: "user:a", relation: "member", object: "sched_app:x" },
			context: { now: "1970-01-01T00:16:40.000Z" },
		});
	});

	it("reads an omitted `allowed` as a refusal, never an allow", async () => {
		expect(await build(answer(200, {})).check("user:a", "member", "sched_app:x")).toBe(false);
	});

	it("fails closed: unreachable, 5xx and a stale model are AuthzUnavailable", async () => {
		await expect(
			build(() => Promise.reject(new TypeError("down"))).check("u", "r", "o:1"),
		).rejects.toBeInstanceOf(AuthzUnavailable);
		await expect(build(answer(503, { code: "x" })).check("u", "r", "o:1")).rejects.toBeInstanceOf(
			AuthzUnavailable,
		);
		await expect(
			build(answer(400, { code: "authorization_model_not_found" })).check("u", "r", "o:1"),
		).rejects.toThrow("authorization_model_not_found");
	});

	it("refuses to be built without a pinned model", () => {
		for (const modelId of ["", "latest", "  "])
			expect(() =>
				createLiveAuthz({
					readUrl: "http://x",
					writeUrl: "http://x",
					storeId: "S",
					modelId,
					token: "t",
				}),
			).toThrow("pinned");
	});

	it("lists objects and writes in chunks of 100, ignoring duplicates and missing tuples, to the write URL", async () => {
		calls.length = 0;
		const live = build(answer(200, { objects: ["sched_client:a"] }));
		expect(await live.listObjects("user:a", "clients_view", "sched_client")).toEqual([
			"sched_client:a",
		]);
		const many = Array.from({ length: 250 }, (_, i) => ({
			user: "user:a",
			relation: "member",
			object: `sched_role:r${i}`,
		}));
		calls.length = 0;
		await live.write({ writes: many, deletes: [many[0] as Tuple] });
		expect(calls.map((c) => c.url)).toEqual([
			"http://fga-admin:8080/stores/S/write",
			"http://fga-admin:8080/stores/S/write",
			"http://fga-admin:8080/stores/S/write",
		]);
		expect(calls[0]?.body).toMatchObject({
			writes: { on_duplicate: "ignore" },
			deletes: { on_missing: "ignore" },
		});
	});

	it("reads at the higher consistency right after its own write, then relaxes", async () => {
		let clock = 0;
		calls.length = 0;
		const live = build(answer(200, { allowed: true }), () => clock);
		await live.write({
			writes: [{ user: "user:a", relation: "member", object: "sched_role:r" }],
			deletes: [],
		});
		await live.check("user:a", "member", "sched_app:x");
		clock = 10_000;
		await live.check("user:a", "member", "sched_app:x");
		const checks = calls.filter((c) => c.url.endsWith("/check"));
		expect(checks.map((c) => c.body.consistency)).toEqual([
			"HIGHER_CONSISTENCY",
			"MINIMIZE_LATENCY",
		]);
	});
});
