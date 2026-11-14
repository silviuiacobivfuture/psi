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

/** The app as it was before roles could include others: every seed role holds its flat set and includes nothing. */
async function asBefore(): Promise<void> {
	for (const r of await w.store.c.roles.list(APP)) {
		const flat = baseline[r.name];
		if (r.system && flat !== undefined)
			await w.store.c.roles.replace({ ...r, permissions: [...flat], includes: [] });
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
/** What each member of the populated world holds on the app, relation by relation. */
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
	reseed({ store: w.store, apps: [APP], baseline, dryRun, now: Date.UTC(2026, 10, 14) });

beforeEach(async () => {
	w = await createWorld();
	await asBefore();
});

describe("re-seeding an app's roles into their composed form", () => {
	it("nobody's permissions change, through OpenFGA, but the Owner's, who gains exactly the Owner-only keys", async () => {
		const before = await held(await authzOfStore());
		const [report] = await run();
		// Owner, Admin and Therapist take their composed form; the four that include nothing are already current
		expect(report?.written).toBe(3);
		const after = await held(await authzOfStore());
		for (const subject of Object.keys(PEOPLE).filter((s) => s !== "olga"))
			expect(after[subject], subject).toEqual(before[subject]);
		const gained = (after.olga ?? []).filter((k) => !(before.olga ?? []).includes(k)).sort();
		expect(gained).toEqual([...OWNER_ONLY_KEYS].sort());
		expect((before.olga ?? []).every((k) => (after.olga ?? []).includes(k))).toBe(true);
	});

	it("writes the composition: Owner includes Admin, Admin the four desk and clinical roles, Therapist the volunteer", async () => {
		await run();
		const roles = await w.store.c.roles.list(APP);
		const name = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
		const includes = Object.fromEntries(
			roles.filter((r) => r.system).map((r) => [r.name, r.includes.map(name).sort()]),
		);
		expect(includes).toMatchObject({
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

	it("leaves a seed role its owners changed as it is, and says so", async () => {
		const reception = (await w.store.c.roles.list(APP)).find((r) => r.name === "Reception");
		if (reception === undefined) throw new Error("no Reception");
		const changed = [...reception.permissions, "audit_log_view_all"].sort();
		await w.store.c.roles.replace({ ...reception, permissions: changed });
		const [report] = await run();
		expect(report?.steps.find((s) => s.name === "Reception")?.kind).toBe("customised");
		expect((await w.store.c.roles.get(APP, reception.id))?.permissions).toEqual(changed);
		// The Administrator includes Recepție: with Recepție customised, the rest still re-seed by their own sets.
		expect(report?.steps.find((s) => s.name === "Owner")?.kind).toBe("rewrite");
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
