import { describe, expect, it } from "vitest";
import { createAccess } from "./access";
import { appLink, memberLink, ownerLink, roleGrant, roleHolder, treatingLink } from "./links";
import { createLiveAuthz } from "./live";
import { createMemoryAuthz } from "./memory";
import { type AuthzPort, AuthzUnavailable, type CheckQuestion, type Tuple } from "./port";

/** A therapist (Dora) who sees her own clients, three of the app's five, through her calendar. */
const TUPLES: Tuple[] = [
	appLink("sched_calendar", "pdora", "psizone"),
	ownerLink("pdora", "dora"),
	...["c1", "c2", "c3", "c4", "c5"].map((c) => appLink("sched_client", c, "psizone")),
	...["c1", "c2", "c3"].map((c) => treatingLink(c, "pdora")),
	roleGrant("r-own", "psizone", "clients_view_own"),
	roleGrant("r-own", "psizone", "clients_view_own_contact"),
	roleGrant("r-own", "psizone", "clients_view_own_guardian"),
	memberLink("psizone", "dora"),
	roleHolder("r-own", "dora"),
];

/** What reached the real (in-memory) adapter: every round trip, as OpenFGA would see it. */
function counted(inner: AuthzPort) {
	const asked = { check: 0, batches: [] as number[], lists: 0, writes: 0 };
	const port: AuthzPort = {
		check(user, relation, object) {
			asked.check += 1;
			return inner.check(user, relation, object);
		},
		checkMany(questions: readonly CheckQuestion[]) {
			asked.batches.push(questions.length);
			return inner.checkMany(questions);
		},
		listObjects(user, relation, type) {
			asked.lists += 1;
			return inner.listObjects(user, relation, type);
		},
		write(change) {
			asked.writes += 1;
			return inner.write(change);
		},
	};
	return { port, asked };
}

const deniedNothing = () => Promise.resolve(new Set<string>());

describe("one request asks each authorization question once", () => {
	it("a permission's scopes are one BatchCheck, not one Check per scope", async () => {
		const { port, asked } = counted(createMemoryAuthz(TUPLES));
		const access = createAccess(port, deniedNothing);
		expect(await access.scopesHeld("dora", "psizone", "clients_view")).toEqual(["own"]);
		expect(asked.check).toBe(0);
		expect(asked.batches).toEqual([3]);
	});

	it("the field groups of a list share ONE ListObjects for the reach they have in common", async () => {
		const { port, asked } = counted(createMemoryAuthz(TUPLES));
		const { access } = createAccess(port, deniedNothing).forRequest();
		const reaches = await Promise.all(
			["clients_view", "clients_view_contact", "clients_view_guardian"].map((key) =>
				access.reach("dora", "psizone", key, "sched_client"),
			),
		);
		for (const reach of reaches)
			expect(reach).toEqual({ kind: "ids", ids: new Set(["c1", "c2", "c3"]) });
		expect(asked.lists).toBe(1);
	});

	it("a question asked for every row of a list reaches OpenFGA once", async () => {
		const { port, asked } = counted(createMemoryAuthz(TUPLES));
		const { access } = createAccess(port, deniedNothing).forRequest();
		for (let i = 0; i < 50; i++)
			expect(await access.canOn("dora", "psizone", "clients_view", "sched_client", "c1")).toBe(
				true,
			);
		expect(await access.canOn("dora", "psizone", "clients_view", "sched_client", "c4")).toBe(false);
		expect(asked.check).toBe(2);
	});

	it("a batch sends only the questions not asked yet, and none when all were", async () => {
		const { port, asked } = counted(createMemoryAuthz(TUPLES));
		const { authz } = createAccess(port, deniedNothing).forRequest();
		const q = (object: string): CheckQuestion => ({
			user: "user:dora",
			relation: "clients_view",
			object,
		});
		expect(await authz.checkMany([q("sched_client:c1"), q("sched_client:c4")])).toEqual([
			true,
			false,
		]);
		expect(
			await authz.checkMany([q("sched_client:c4"), q("sched_client:c2"), q("sched_client:c2")]),
		).toEqual([false, true, true]);
		expect(await authz.checkMany([q("sched_client:c1"), q("sched_client:c2")])).toEqual([
			true,
			true,
		]);
		expect(asked.batches).toEqual([2, 1]);
		expect(asked.check).toBe(0);
	});

	it("a write forgets what was remembered: the next answer is OpenFGA's new one", async () => {
		const { port, asked } = counted(createMemoryAuthz(TUPLES));
		const { access, authz } = createAccess(port, deniedNothing).forRequest();
		expect(await access.canOn("dora", "psizone", "clients_view", "sched_client", "c4")).toBe(false);
		await authz.write({ writes: [treatingLink("c4", "pdora")], deletes: [] });
		expect(await access.canOn("dora", "psizone", "clients_view", "sched_client", "c4")).toBe(true);
		expect((await access.reach("dora", "psizone", "clients_view", "sched_client")).kind).toBe(
			"ids",
		);
		expect(asked.writes).toBe(1);
		expect(asked.check).toBe(2);
	});

	it("a person's denials are read once per request, and again after a write", async () => {
		let reads = 0;
		const denials = () => {
			reads += 1;
			return Promise.resolve(new Set<string>());
		};
		const { access, authz } = createAccess(createMemoryAuthz(TUPLES), denials).forRequest();
		await access.canAll("dora", "psizone", "clients_view");
		await access.reach("dora", "psizone", "clients_view", "sched_client");
		expect(reads).toBe(1);
		await authz.write({ writes: [], deletes: [] });
		await access.canAll("dora", "psizone", "clients_view");
		expect(reads).toBe(2);
	});

	it("a failed question is not remembered as an answer: it is asked again", async () => {
		let fail = true;
		const inner = createMemoryAuthz(TUPLES);
		const flaky: AuthzPort = {
			...inner,
			check: (user, relation, object) =>
				fail
					? Promise.reject(new AuthzUnavailable("authz: OpenFGA is unreachable"))
					: inner.check(user, relation, object),
		};
		const { access } = createAccess(flaky, deniedNothing).forRequest();
		await expect(access.isMember("dora", "psizone")).rejects.toThrow(AuthzUnavailable);
		fail = false;
		expect(await access.isMember("dora", "psizone")).toBe(true);
	});

	it("two requests share nothing: each asks for itself", async () => {
		const { port, asked } = counted(createMemoryAuthz(TUPLES));
		const shared = createAccess(port, deniedNothing);
		await shared.forRequest().access.isMember("dora", "psizone");
		await shared.forRequest().access.isMember("dora", "psizone");
		expect(asked.check).toBe(2);
	});
});

describe("the live adapter's ListObjects", () => {
	const listing = (objects: string[]) =>
		createLiveAuthz({
			readUrl: "http://fga:8081",
			writeUrl: "http://fga:8080",
			storeId: "S",
			modelId: "M1",
			token: "tok",
			fetch: async () => new Response(JSON.stringify({ objects }), { status: 200 }),
		});

	it("answers a list under OpenFGA's result cap as it came", async () => {
		const objects = Array.from({ length: 999 }, (_, i) => `sched_client:c${i}`);
		expect(await listing(objects).listObjects("user:a", "reach_own", "sched_client")).toEqual(
			objects,
		);
	});

	it("fails closed on a list that reached the cap (it may be partial), never answers part of the reach", async () => {
		const objects = Array.from({ length: 1000 }, (_, i) => `sched_client:c${i}`);
		await expect(
			listing(objects).listObjects("user:a", "reach_own", "sched_client"),
		).rejects.toThrow("result cap");
	});
});
