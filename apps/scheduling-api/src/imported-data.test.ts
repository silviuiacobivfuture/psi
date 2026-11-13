import { beforeAll, describe, expect, it } from "vitest";
import { createAccess } from "./authz/access";
import { createMemoryAuthz } from "./authz/memory";
import { seedAppAccess } from "./handlers/apps";
import { ok, type Populated, populate } from "./testing/populate";
import { createBareWorld } from "./testing/world";

const A = "/v1/apps/psizone";

describe("a clinic that came in through an import", () => {
	let w: Populated;
	beforeAll(async () => {
		w = await populate(await createBareWorld());
	});

	it("lists a package of bonus sessions only (the old app held some) instead of answering a mismatch", async () => {
		const id = String(
			ok(
				await w.call("olga", "POST", `${A}/clients/${w.ids.c1}/packages`, {
					name: "bonus only",
					sessions: 1,
					priceCents: 0,
				}),
				"package",
			).id,
		);
		const row = await w.store.c.packages.get("psizone", id);
		if (row === undefined) throw new Error("the package was just made");
		await w.store.c.packages.replace({ ...row, sessions: 0, bonus: 4 });
		const listed = ok(await w.call("olga", "GET", `${A}/clients/${w.ids.c1}/packages`), "list");
		const found = (
			listed.items as { id: string; sessions: number; sessionsRemaining: number }[]
		).find((p) => p.id === id);
		expect(found?.sessions).toBe(0);
		expect(found?.sessionsRemaining).toBe(4);
		expect(w.logs.filter((l) => l.event === "response_mismatch")).toEqual([]);
	});

	it("restores the roles, members and object links from the store alone, so the owner reaches every client", async () => {
		const empty = createMemoryAuthz();
		const denials = async () => new Set<string>();
		const before = createAccess(empty, denials);
		expect(await before.canOn("olga", "psizone", "clients_view", "sched_client", w.ids.c1)).toBe(
			false,
		);
		await seedAppAccess({ ...w.deps, authz: empty, access: before }, "psizone", "olga");
		const after = createAccess(empty, denials);
		expect(await after.canOn("olga", "psizone", "clients_view", "sched_client", w.ids.c1)).toBe(
			true,
		);
		expect(await after.canOn("olga", "psizone", "clients_view", "sched_client", w.ids.c2)).toBe(
			true,
		);
		expect(await after.canAll("rita", "psizone", "clients_view")).toBe(true);
		expect(await after.canAll("nobody", "psizone", "clients_view")).toBe(false);
	});

	it("repeats without changing what the store holds", async () => {
		const members = await w.store.c.members.list("psizone");
		const roles = await w.store.c.roles.list("psizone");
		const authz = createMemoryAuthz();
		await seedAppAccess(
			{ ...w.deps, authz, access: createAccess(authz, async () => new Set<string>()) },
			"psizone",
			"olga",
		);
		expect(await w.store.c.members.list("psizone")).toEqual(members);
		expect(await w.store.c.roles.list("psizone")).toEqual(roles);
	});
});
