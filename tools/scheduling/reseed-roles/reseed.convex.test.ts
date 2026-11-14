import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { type ComposedRole, effectiveOf, OWNER_ONLY_KEYS } from "@psi/scheduling/permissions";
import { openConvexStore } from "@psi/scheduling-api/open-convex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { reseed } from "./run";

/**
 * The re-seed against a real (local) Convex: CONVEX_URL and PSI_CONVEX_DATA, as reconcile.convex.test.ts reads them.
 * The Convex wrappers check every inclusion (same app, no cycle, not too deep), so this is the run the deploy makes.
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
		"reseed.convex.test: no local Convex backend (CONVEX_URL, PSI_CONVEX_DATA): skipped",
	);

const APP = `test-reseed-${Date.now().toString(36)}`;
const baseline = z
	.record(z.array(z.string()))
	.parse(
		JSON.parse(
			readFileSync(
				createRequire(import.meta.url).resolve("@psi/scheduling/seed/roles-before-inclusion.json"),
				"utf8",
			),
		),
	);

async function admin(path: string, args: Record<string, unknown>): Promise<void> {
	const res = await fetch(`${url}/api/mutation`, {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Convex ${adminKey}` },
		body: JSON.stringify({ path, args, format: "json" }),
	});
	if (!res.ok) throw new Error(`${path} answered ${res.status}`);
}

describe.skipIf(!ready)("the re-seed on a real Convex store", () => {
	const opened = ready ? openConvexStore({ url, serverKey }) : undefined;
	beforeAll(async () => {
		await admin("clinicApps:ensureApp", {
			slug: APP,
			name: "Reseed test",
			kind: "clinic",
			defaultLocale: "ro",
			currency: "RON",
		});
	});
	afterAll(async () => {
		await opened?.close();
		if (ready) await admin("seed:dropFixture", { tenant: APP });
	});

	it("a new app starts composed; one with the old flat roles takes the composition, the same permissions bar the Owner's", async () => {
		if (opened === undefined) throw new Error("not ready");
		const { store } = opened;
		const composed = await store.c.roles.list(APP);
		expect(composed.find((r) => r.name === "Owner")?.includes).toHaveLength(1);
		// Back to how an app seeded before this change holds them.
		for (const r of composed)
			await store.c.roles.replace({
				...r,
				permissions: [...(baseline[r.name] ?? [])],
				includes: [],
			});
		const [report] = await reseed({ store, apps: [APP], dryRun: false, now: Date.now() });
		expect(report?.written).toBe(3);
		const roles = await store.c.roles.list(APP);
		const byId = new Map<string, ComposedRole>(
			roles.map((r) => [r.id, { id: r.id, permissions: r.permissions, includes: r.includes }]),
		);
		for (const r of roles) {
			const keys = [...effectiveOf(r.id, byId).keys].sort();
			const expected =
				r.name === "Owner"
					? [...new Set([...(baseline.Owner ?? []), ...OWNER_ONLY_KEYS])].sort()
					: [...(baseline[r.name] ?? [])].sort();
			expect(keys, r.name).toEqual(expected);
		}
		const [again] = await reseed({ store, apps: [APP], dryRun: false, now: Date.now() });
		expect(again?.written).toBe(0);
	});
});
