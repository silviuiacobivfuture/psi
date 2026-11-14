import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Populated } from "./testing/populate";
import { worldFactories } from "./testing/worlds";

/**
 * The journal of a team change says the same on every store: the memory store keeps the API's `detail.changes`, the
 * Convex store's wrappers keep the same before and after in the transaction of the write. Run once per adapter (Convex
 * when a local backend is reachable, see testing/worlds.ts), with the same expectations, and the two answers compared.
 */
const A = "/v1/apps/psizone";
const SUBJECT = "journal-newbie";

type Change = { from: string; to: string };
type Kept = { action: string; type: string; id: string; changes: Record<string, Change> | null };

const factories = await worldFactories();
const answers = new Map<string, Kept[]>();

async function story(w: Populated): Promise<Kept[]> {
	const as = (method: string, path: string, body?: unknown) =>
		w.call("olga", method, `${A}${path}`, body);
	const reception = w.ids.roles.reception ?? "";
	const coordinator = w.ids.roles.coordinator ?? "";
	const steps = [
		await as("PUT", `/members/${SUBJECT}`, {
			displayName: "Nou Venit Ăîșț",
			email: "nou.venit@example.test",
			roles: [reception],
			coordinates: [w.ids.dora],
		}),
		await as("PUT", `/members/${SUBJECT}`, {
			displayName: "Nou Venit Ăîșț",
			email: "nou.venit@example.test",
			roles: [coordinator, reception],
			coordinates: [],
		}),
		await as("PUT", `/members/${SUBJECT}/overrides`, {
			grant: ["people_view_all"],
			deny: ["roster_view_all"],
		}),
		await as("DELETE", `/members/${SUBJECT}`),
	];
	for (const r of steps) expect(r.status, JSON.stringify(r.json)).toBe(200);
	const items = (await as("GET", "/audit?limit=500")).json.items as {
		action: string;
		target: { type: string; id: string };
		detail?: { changes?: Record<string, Change> };
	}[];
	return items
		.filter((e) => e.target.id === SUBJECT && e.action.startsWith("member."))
		.map((e) => ({
			action: e.action,
			type: e.target.type,
			id: e.target.id,
			changes: e.detail?.changes ?? null,
		}))
		.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe.each(factories)("the journal keeps what a team change was, on $name", (factory) => {
	let w: Populated;
	let kept: Kept[];
	beforeAll(async () => {
		w = await factory.create();
		kept = await story(w);
		answers.set(factory.name, kept);
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	const sorted = (...ids: string[]): string => [...ids].sort().join(",");
	const event = (action: string): Kept[] => kept.filter((e) => e.action === action);

	it("names the member by their sign-in, as the console looks them up", () => {
		expect(kept.length).toBe(4);
		expect(kept.every((e) => e.type === "members" && e.id === SUBJECT)).toBe(true);
	});

	it("adding someone keeps their name, roles and calendars from nothing", () => {
		const added = event("member.put").find((e) => e.changes?.displayName?.from === "");
		expect(added?.changes).toEqual({
			displayName: { from: "", to: "Nou Venit Ăîșț" },
			roles: { from: "", to: w.ids.roles.reception },
			coordinates: { from: "", to: w.ids.dora },
		});
	});

	it("changing the roles keeps only what moved: the roles before and after, the calendar dropped", () => {
		const changed = event("member.put").find((e) => e.changes?.displayName === undefined);
		expect(changed?.changes).toEqual({
			roles: {
				from: w.ids.roles.reception,
				to: sorted(w.ids.roles.reception ?? "", w.ids.roles.coordinator ?? ""),
			},
			coordinates: { from: w.ids.dora, to: "" },
		});
	});

	it("individual grants and denials keep both lists", () => {
		expect(event("member.overrides").map((e) => e.changes)).toEqual([
			{
				grants: { from: "", to: "people_view_all" },
				denies: { from: "", to: "roster_view_all" },
			},
		]);
	});

	it("a removal keeps the name and the roles of who left", () => {
		expect(event("member.remove").map((e) => e.changes)).toEqual([
			{
				displayName: { from: "Nou Venit Ăîșț", to: "" },
				roles: {
					from: sorted(w.ids.roles.reception ?? "", w.ids.roles.coordinator ?? ""),
					to: "",
				},
			},
		]);
	});

	it("never keeps the e-mail address", () => {
		expect(JSON.stringify(kept)).not.toContain("nou.venit@example.test");
	});
});

describe.skipIf(factories.length < 2)("parity", () => {
	it("Convex answers the journal exactly as memory does, ids aside", () => {
		const shape = (rows: Kept[] | undefined) =>
			(rows ?? []).map((e) => ({
				action: e.action,
				fields: Object.keys(e.changes ?? {}).sort(),
			}));
		expect(shape(answers.get("convex"))).toEqual(shape(answers.get("memory")));
	});
});
