import { SEED_ROLES } from "@psi/scheduling/permissions";
import { createMemoryAuthz } from "@psi/scheduling-api/authz-memory";
import { createWorld, type Populated } from "@psi/scheduling-api/testing-populate";
import { beforeEach, describe, expect, it } from "vitest";
import { parseMemberSpec } from "./members";
import { reconcile } from "./run";

let w: Populated;
const T = 1_800_000_000_000;
beforeEach(async () => {
	w = await createWorld();
	// What the deployment's ensureEstateApps leaves: the app's row and nothing else.
	await w.store.c.apps.insert({
		id: "fresh",
		app: "fresh",
		name: "Fresh",
		timeZone: "Europe/Bucharest",
		status: "active",
		createdAt: T,
		updatedAt: T,
	});
});

const run = (over: Partial<Parameters<typeof reconcile>[0]> = {}) => {
	const authz = createMemoryAuthz();
	return {
		authz,
		report: reconcile({
			store: w.store,
			authz,
			apps: ["fresh"],
			members: [],
			prefix: "",
			dryRun: false,
			prune: false,
			...over,
		}),
	};
};

const strip = (r: { id: string; app: string; createdAt: number; updatedAt: number }) => {
	const { id, app, createdAt: _c, updatedAt: _u, ...rest } = r;
	return { slug: id.slice(app.length + 1), ...rest };
};

describe("--seed-roles: an app the deployment made, with no role, gets the service's seed roles", () => {
	it("seeds every seed role, as the service's own app creation does, and members can then be made", async () => {
		const { authz, report } = run({
			seedRoles: true,
			members: [parseMemberSpec("boss=Owner"), parseMemberSpec("boss=Admin")],
		});
		const r = await report;
		expect(r.apps[0]?.seeded).toBe("seeded");
		const roles = await w.store.c.roles.list("fresh");
		expect(roles.map((x) => x.name).sort()).toEqual(SEED_ROLES.map((x) => x.name).sort());
		expect(roles.every((x) => x.system && x.id.startsWith("fresh-"))).toBe(true);
		// The very rows the service seeds for an app it creates (psizone, made through the API in the test world).
		const viaService = (await w.store.c.roles.list("psizone")).filter((x) => x.system).map(strip);
		expect(roles.map(strip).sort((a, b) => a.slug.localeCompare(b.slug))).toEqual(
			viaService.sort((a, b) => a.slug.localeCompare(b.slug)),
		);
		expect(r.apps[0]?.members).toEqual([
			{ subject: "boss", outcome: "created" },
			{ subject: "boss", outcome: "role_added" },
		]);
		expect((await w.store.c.members.get("fresh", "boss"))?.roles.sort()).toEqual(
			["fresh-admin", "fresh-owner"].sort(),
		);
		expect(await authz.check("user:boss", "roles_edit_all", "sched_app:fresh")).toBe(true);
	});

	it("a repeat changes nothing: the roles are held, rows and stamps as they were", async () => {
		await run({ seedRoles: true }).report;
		const before = await w.store.c.roles.list("fresh");
		const again = await run({ seedRoles: true }).report;
		expect(again.apps[0]?.seeded).toBe("held");
		expect(await w.store.c.roles.list("fresh")).toEqual(before);
	});

	it("an app that has roles keeps them exactly", async () => {
		const before = await w.store.c.roles.list("psizone");
		const r = await run({ seedRoles: true, apps: ["psizone"] }).report;
		expect(r.apps[0]?.seeded).toBe("held");
		expect(await w.store.c.roles.list("psizone")).toEqual(before);
	});

	it("a dry run says it would seed, and writes no role, no member and no tuple", async () => {
		const { authz, report } = run({ seedRoles: true, dryRun: true });
		expect((await report).apps[0]?.seeded).toBe("would_seed");
		expect(await w.store.c.roles.list("fresh")).toEqual([]);
		expect(await w.store.c.members.list("fresh")).toEqual([]);
		expect(authz.tuples()).toEqual([]);
	});

	it("with a prefix, the seeded roles' tuples land on the prefixed app object only", async () => {
		const { authz, report } = run({
			seedRoles: true,
			prefix: "prod-",
			members: [parseMemberSpec("boss=Owner")],
		});
		await report;
		expect(await authz.check("user:boss", "roles_edit_all", "sched_app:prod-fresh")).toBe(true);
		expect(await authz.check("user:boss", "roles_edit_all", "sched_app:fresh")).toBe(false);
	});

	it("without --seed-roles an app with no role refuses a member by name, and nothing is written", async () => {
		const { authz, report } = run({ members: [parseMemberSpec("boss=Owner")] });
		await expect(report).rejects.toThrow('has no role named "Owner"');
		expect(await w.store.c.roles.list("fresh")).toEqual([]);
		expect(await w.store.c.members.list("fresh")).toEqual([]);
		expect(authz.tuples()).toEqual([]);
	});
});
