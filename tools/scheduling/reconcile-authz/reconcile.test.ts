import { createMemoryAuthz, type MemoryAuthz } from "@psi/scheduling-api/authz-memory";
import type { Tuple } from "@psi/scheduling-api/authz-port";
import { createWorld, type Populated } from "@psi/scheduling-api/testing-populate";
import { beforeEach, describe, expect, it } from "vitest";
import type { FgaReader } from "./fga";
import { parseMemberSpec } from "./members";
import { reconcile } from "./run";

const key = (t: Tuple): string => `${t.user}|${t.relation}|${t.object}`;
/** The platform administrator the test world starts with: not the store's to imply. */
const isPlatformAdmin = (t: Tuple): boolean => t.object.startsWith("platform:");
const keysOf = (a: MemoryAuthz): Set<string> =>
	new Set(
		a
			.tuples()
			.filter((t) => !isPlatformAdmin(t))
			.map(key),
	);
const readerOf = (a: MemoryAuthz): FgaReader => ({
	ofType: async (type) => a.tuples().filter((t) => t.object.startsWith(`${type}:`)),
});

let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});

const run = (authz: MemoryAuthz, over: Partial<Parameters<typeof reconcile>[0]> = {}) =>
	reconcile({
		store: w.store,
		authz,
		apps: ["psizone"],
		members: [],
		prefix: "",
		dryRun: false,
		prune: false,
		...over,
	});

describe("reconcile writes what the service itself wrote, from the store alone", () => {
	it("reproduces every tuple the handlers wrote when the rows were made", async () => {
		const fresh = createMemoryAuthz();
		const report = await run(fresh, { apps: ["psizone", "hemisync"] });
		const wrote = keysOf(w.authz);
		const made = keysOf(fresh);
		expect(wrote.size).toBeGreaterThan(50);
		expect([...wrote].filter((k) => !made.has(k))).toEqual([]);
		expect(report.written).toBeGreaterThanOrEqual(wrote.size);
		expect(report.apps.reduce((n, a) => n + a.counts.total, 0)).toBe(report.written);
	});

	it("so the owner is authorized again on a store whose tuples were lost", async () => {
		const fresh = createMemoryAuthz();
		await run(fresh);
		expect(await fresh.check("user:olga", "member", "sched_app:psizone")).toBe(true);
		expect(await fresh.check("user:olga", "clients_view_all", "sched_app:psizone")).toBe(true);
		expect(await fresh.check("user:olga", "clients_view_all", "sched_app:psizone")).toBe(true);
		expect(await fresh.check("user:nobody", "member", "sched_app:psizone")).toBe(false);
	});

	it("is idempotent: a second run leaves the same tuples", async () => {
		const fresh = createMemoryAuthz();
		await run(fresh);
		const once = keysOf(fresh);
		await run(fresh);
		expect(keysOf(fresh)).toEqual(once);
	});

	it("a dry run writes nothing and says how much there would be", async () => {
		const fresh = createMemoryAuthz();
		const report = await run(fresh, { dryRun: true });
		expect(fresh.tuples()).toEqual([]);
		expect(report.written).toBe(0);
		const counts = report.apps[0]?.counts;
		expect(counts?.platform).toBe(1);
		expect(counts?.roles).toBeGreaterThan(0);
		expect(counts?.members).toBeGreaterThan(0);
		expect(counts?.links).toBeGreaterThan(0);
	});

	it("an app the store does not hold is refused, writing nothing", async () => {
		const fresh = createMemoryAuthz();
		await expect(run(fresh, { apps: ["no-such-app"] })).rejects.toThrow("not in the store");
		expect(fresh.tuples()).toEqual([]);
	});

	it("a prefix is put on the app's id and on nothing else", async () => {
		const fresh = createMemoryAuthz();
		await run(fresh, { prefix: "dev-" });
		const tuples = fresh.tuples();
		expect(tuples.some((t) => t.object === "sched_app:dev-psizone")).toBe(true);
		expect(
			tuples.some((t) => t.object === "sched_app:psizone" || t.user === "sched_app:psizone"),
		).toBe(false);
		expect(tuples.some((t) => t.object === `sched_client:${w.ids.c1}`)).toBe(true);
		expect(tuples.some((t) => t.user === "sched_app:dev-psizone" && t.relation === "app")).toBe(
			true,
		);
	});
});

describe("nothing is deleted unless asked", () => {
	const stray: Tuple = { user: "sched_app:psizone", relation: "app", object: "sched_client:ghost" };

	it("a run without --prune keeps a tuple the store does not imply", async () => {
		const fresh = createMemoryAuthz([stray]);
		await run(fresh);
		expect(keysOf(fresh).has(key(stray))).toBe(true);
	});

	it("--prune removes exactly those, and a dry run only counts them", async () => {
		const fresh = createMemoryAuthz([stray]);
		await run(fresh, { prune: true, dryRun: true, reader: readerOf(fresh) });
		expect(keysOf(fresh).has(key(stray))).toBe(true);
		const real = createMemoryAuthz([stray]);
		const report = await run(real, { prune: true, reader: readerOf(real) });
		expect(report.pruned).toBe(1);
		expect(keysOf(real).has(key(stray))).toBe(false);
		expect(await real.check("user:olga", "member", "sched_app:psizone")).toBe(true);
	});

	it("--prune without a way to read OpenFGA is refused", async () => {
		await expect(run(createMemoryAuthz(), { prune: true })).rejects.toThrow("read");
	});
});

describe("a member is bootstrapped through the store, and their tuples follow", () => {
	it("makes a person a member holding the named role", async () => {
		const fresh = createMemoryAuthz();
		const report = await run(fresh, { members: [parseMemberSpec("newowner=owner")] });
		expect(report.apps[0]?.members).toEqual([{ subject: "newowner", outcome: "created" }]);
		const row = await w.store.c.members.get("psizone", "newowner");
		expect(row?.roles.length).toBe(1);
		expect(await fresh.check("user:newowner", "member", "sched_app:psizone")).toBe(true);
		expect(await fresh.check("user:newowner", "roles_edit_all", "sched_app:psizone")).toBe(true);
	});

	it("adds the role to a person who is already a member, and a repeat changes nothing", async () => {
		const first = await run(createMemoryAuthz(), { members: [parseMemberSpec("rita=Accountant")] });
		expect(first.apps[0]?.members[0]?.outcome).toBe("role_added");
		const held = await w.store.c.members.get("psizone", "rita");
		const again = await run(createMemoryAuthz(), { members: [parseMemberSpec("rita=Accountant")] });
		expect(again.apps[0]?.members[0]?.outcome).toBe("unchanged");
		expect(await w.store.c.members.get("psizone", "rita")).toEqual(held);
	});

	it("an unknown role is refused with the names there are, and nothing is written", async () => {
		const fresh = createMemoryAuthz();
		await expect(run(fresh, { members: [parseMemberSpec("x-person=Wizard")] })).rejects.toThrow(
			/no role named "Wizard" \(it has: .*Owner/,
		);
		expect(await w.store.c.members.get("psizone", "x-person")).toBeUndefined();
		expect(fresh.tuples()).toEqual([]);
	});

	it("a dry run reports what it would make and makes nothing", async () => {
		const fresh = createMemoryAuthz();
		const report = await run(fresh, {
			dryRun: true,
			members: [parseMemberSpec("dry-person=Owner")],
		});
		expect(report.apps[0]?.members[0]?.outcome).toBe("created");
		expect(await w.store.c.members.get("psizone", "dry-person")).toBeUndefined();
	});

	it("refuses what is not <subject>=<role name>", () => {
		for (const bad of [
			"",
			"owner",
			"=Owner",
			"owner=",
			"-owner=Owner",
			"a=b",
			`${"x".repeat(201)}=Owner`,
		])
			expect(() => parseMemberSpec(bad), bad).toThrow("--member");
	});

	it("takes a real sign-in subject: Authentik's 64-character hashed id, digits first", () => {
		const sub = `9${"a1".repeat(31)}f`;
		expect(() => parseMemberSpec(`${sub}=Owner`)).not.toThrow();
	});
});
