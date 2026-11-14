import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMemoryAuthz } from "@psi/scheduling-api/authz-memory";
import { openConvexStore } from "@psi/scheduling-api/open-convex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseMemberSpec } from "./members";
import { reconcile } from "./run";

/**
 * Against a throwaway app in a real (local) Convex: CONVEX_URL and PSI_CONVEX_DATA (a directory with
 * `secrets/server-key` and `secrets/admin-key`, as packages/scheduling/scripts/local-backend.sh writes them). Without
 * them the suite is skipped and says so.
 */
const url = process.env.CONVEX_URL;
const data = process.env.PSI_CONVEX_DATA;
const read = (name: string): string | undefined => {
	try {
		return data === undefined
			? undefined
			: readFileSync(join(data, "secrets", name), "utf8").trim();
	} catch {
		return undefined;
	}
};
const serverKey = read("server-key");
const adminKey = read("admin-key");
const ready = url !== undefined && serverKey !== undefined && adminKey !== undefined;
if (!ready)
	console.warn(
		"reconcile.convex.test: no local Convex backend (CONVEX_URL, PSI_CONVEX_DATA): skipped",
	);

const APP = `test-reconcile-${Date.now().toString(36)}`;

async function admin(kind: "mutation" | "query", path: string, args: Record<string, unknown>) {
	const res = await fetch(`${url}/api/${kind}`, {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Convex ${adminKey}` },
		body: JSON.stringify({ path, args, format: "json" }),
	});
	if (!res.ok) throw new Error(`${path} answered ${res.status}`);
}

describe.skipIf(!ready)("reconcile on a real Convex store", () => {
	const opened = ready ? openConvexStore({ url, serverKey }) : undefined;
	beforeAll(async () => {
		await admin("mutation", "clinicApps:ensureApp", {
			slug: APP,
			name: "Reconcile test",
			kind: "clinic",
			defaultLocale: "ro",
			currency: "RON",
		});
	});
	afterAll(async () => {
		await opened?.close();
		if (ready) await admin("mutation", "seed:dropFixture", { tenant: APP });
	});

	it("makes a member from a stored role, reads every row, and writes the tuples that authorize them", async () => {
		if (opened === undefined) throw new Error("not ready");
		const { store } = opened;
		const now = Date.now();
		const person = await store.c.people.insert({
			id: "p0",
			app: APP,
			displayName: "Synthetic Practitioner",
			kind: "practitioner",
			active: true,
			external: false,
			createdAt: now,
			updatedAt: now,
		});
		const client = await store.c.clients.insert({
			id: "c0",
			app: APP,
			name: "Synthetic Client",
			status: "active",
			treating: [person.id],
			createdAt: now,
			updatedAt: now,
		});
		const authz = createMemoryAuthz();
		const report = await reconcile({
			store,
			authz,
			apps: [APP],
			members: [parseMemberSpec("synthetic-owner=Owner")],
			prefix: "",
			dryRun: false,
			prune: false,
		});
		const counts = report.apps[0]?.counts;
		expect(report.apps[0]?.members).toEqual([{ subject: "synthetic-owner", outcome: "created" }]);
		expect(counts?.platform).toBe(1);
		expect(counts?.roles).toBeGreaterThan(0);
		expect(counts?.members).toBeGreaterThan(0);
		expect(counts?.links).toBeGreaterThan(0);
		expect(await authz.check("user:synthetic-owner", "member", `sched_app:${APP}`)).toBe(true);
		expect(await authz.check("user:synthetic-owner", "clients_view_all", `sched_app:${APP}`)).toBe(
			true,
		);
		expect(
			authz.tuples().some((t) => t.object === `sched_client:${client.id}` && t.relation === "app"),
		).toBe(true);
		// A rerun finds the member and changes nothing.
		const again = await reconcile({
			store,
			authz,
			apps: [APP],
			members: [parseMemberSpec("synthetic-owner=Owner")],
			prefix: "",
			dryRun: false,
			prune: false,
		});
		expect(again.apps[0]?.members[0]?.outcome).toBe("unchanged");
		expect(authz.tuples().length).toBe(report.written);
	});
});
