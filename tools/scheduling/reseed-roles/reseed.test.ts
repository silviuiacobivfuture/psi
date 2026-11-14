import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ALL_PERMISSION_KEYS, OWNER_ONLY_KEYS } from "@psi/scheduling/permissions";
import { createMemoryAuthz, type MemoryAuthz } from "@psi/scheduling-api/authz-memory";
import { createWorld, PEOPLE, type Populated } from "@psi/scheduling-api/testing-populate";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { FgaReader } from "../reconcile-authz/fga";
import { reconcile } from "../reconcile-authz/run";
import { reseed } from "./run";

/** What the seed roles held, flat, before roles could include others. */
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
const APP = "psizone";
let w: Populated;

/** The app as one provisioned before roles could include others: every seed role flat, `change` applied to its set. */
async function asBefore(
	change: (name: string, keys: string[]) => string[] = (_n, k) => k,
): Promise<void> {
	for (const r of await w.store.c.roles.list(APP)) {
		const flat = baseline[r.name];
		if (r.system && flat !== undefined)
			await w.store.c.roles.replace({ ...r, permissions: change(r.name, [...flat]), includes: [] });
	}
}

const readerOf = (a: MemoryAuthz): FgaReader => ({
	ofType: async (type) => a.tuples().filter((t) => t.object.startsWith(`${type}:`)),
});
/** OpenFGA as the store implies it, written from nothing by the reconcile tool. */
async function authzOfStore(): Promise<MemoryAuthz> {
	const authz = createMemoryAuthz();
	await reconcile({
		store: w.store,
		authz,
		reader: readerOf(authz),
		apps: [APP],
		members: [],
		prefix: "",
		dryRun: false,
		prune: false,
	});
	return authz;
}
/** What each member of the populated world holds on the app, relation by relation, through OpenFGA. */
async function held(authz: MemoryAuthz): Promise<Record<string, string[]>> {
	const out: Record<string, string[]> = {};
	for (const subject of Object.keys(PEOPLE)) {
		const keys: string[] = [];
		for (const k of ALL_PERMISSION_KEYS)
			if (await authz.check(`user:${subject}`, k, `sched_app:${APP}`)) keys.push(k);
		out[subject] = keys;
	}
	return out;
}
const run = (dryRun = false) =>
	reseed({ store: w.store, apps: [APP], dryRun, now: Date.UTC(2026, 10, 14) });

/** Nobody's permissions change, through OpenFGA, but the Owner's, who gains exactly the Owner-only keys. */
async function sameButTheOwner(before: Record<string, string[]>): Promise<void> {
	const after = await held(await authzOfStore());
	for (const subject of Object.keys(PEOPLE).filter((s) => s !== "olga"))
		expect(after[subject], subject).toEqual(before[subject]);
	const gained = (after.olga ?? []).filter((k) => !(before.olga ?? []).includes(k)).sort();
	expect(gained).toEqual(
		[...OWNER_ONLY_KEYS].filter((k) => !(before.olga ?? []).includes(k)).sort(),
	);
	for (const k of OWNER_ONLY_KEYS) expect(after.olga, k).toContain(k);
	expect((before.olga ?? []).every((k) => (after.olga ?? []).includes(k))).toBe(true);
}
const includesByName = async (): Promise<Record<string, string[]>> => {
	const roles = await w.store.c.roles.list(APP);
	const name = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
	return Object.fromEntries(
		roles.filter((r) => r.system).map((r) => [r.name, r.includes.map(name).sort()]),
	);
};

beforeEach(async () => {
	w = await createWorld();
});

describe("re-seeding an app whose roles are the old flat seed", () => {
	beforeEach(async () => {
		await asBefore();
	});

	it("keeps every permission held but the Owner's, who gains the Owner-only keys", async () => {
		const before = await held(await authzOfStore());
		const [report] = await run();
		// Owner, Admin and Therapist take their composed form; the four that include nothing are already current
		expect(report?.written).toBe(3);
		await sameButTheOwner(before);
	});

	it("writes the composition: Owner includes Admin, Admin the four desk and clinical roles, Therapist the volunteer", async () => {
		await run();
		expect(await includesByName()).toMatchObject({
			Owner: ["Admin"],
			Admin: ["Accountant", "Coordinator", "Reception", "Therapist"],
			Therapist: ["Volunteer"],
			Reception: [],
			Coordinator: [],
			Volunteer: [],
			Accountant: [],
		});
	});

	it("is idempotent: a second run finds every seed role current and writes nothing", async () => {
		await run();
		const [again] = await run();
		expect(again?.written).toBe(0);
		expect(again?.steps.every((s) => s.kind === "current")).toBe(true);
	});

	it("a dry run writes nothing", async () => {
		const before = JSON.stringify(await w.store.c.roles.list(APP));
		const [report] = await run(true);
		expect(report?.written).toBe(0);
		expect(
			report?.steps
				.filter((s) => s.kind === "rewrite")
				.map((s) => s.name)
				.sort(),
		).toEqual(["Admin", "Owner", "Therapist"]);
		expect(JSON.stringify(await w.store.c.roles.list(APP))).toBe(before);
	});
});

describe("re-seeding an app whose roles are older or changed", () => {
	it("roles seeded before later catalogue keys existed still compose, and keep exactly what they held", async () => {
		// as provisioned before the notes and the feedback came: none of the roles hold those keys
		await asBefore((_n, keys) => keys.filter((k) => !/^(notes|feedback)_/.test(k)));
		const before = await held(await authzOfStore());
		const [report] = await run();
		expect(report?.written).toBe(3);
		expect((await includesByName()).Owner).toEqual(["Admin"]);
		await sameButTheOwner(before);
	});

	it("an included role widened by the owners is not included where that would widen the includer", async () => {
		await asBefore((name, keys) => (name === "Reception" ? [...keys, "audit_log_view_all"] : keys));
		const before = await held(await authzOfStore());
		const [report] = await run();
		const admin = report?.steps.find((s) => s.name === "Admin");
		expect(admin?.kind).toBe("not_contained");
		expect(admin?.missing).toEqual(["audit_log_view_all"]);
		// the Admin stays flat; the Owner, who holds the audit log, still includes it
		expect((await includesByName()).Admin).toEqual([]);
		expect((await includesByName()).Owner).toEqual(["Admin"]);
		await sameButTheOwner(before);
	});

	it("an Owner that cannot include the Administrator still gains the Owner-only keys, and nothing else", async () => {
		await asBefore((name, keys) =>
			name === "Owner" ? keys.filter((k) => k !== "rooms_view_all") : keys,
		);
		const before = await held(await authzOfStore());
		const [report] = await run();
		const owner = report?.steps.find((s) => s.name === "Owner");
		expect(owner?.kind).toBe("not_contained");
		expect((await includesByName()).Owner).toEqual([]);
		await sameButTheOwner(before);
		const [again] = await run();
		expect(again?.written).toBe(0);
	});
});
