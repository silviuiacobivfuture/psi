import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planAt } from "./happy-extra";
import type { Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

describe.each(factories)("the floor plan, on the $name store", (factory) => {
	let w: Populated;
	const as = (who: string | null, method: string, path: string, body?: unknown, app = "psizone") =>
		w.call(who, method, `/v1/apps/${app}/floor-plan${path}`, body);
	beforeAll(async () => {
		w = await factory.create();
		await w.call("olga", "PUT", "/v1/apps/psizone/members/blank", {
			displayName: "Blank",
			roles: [],
			coordinates: [],
		});
	});
	afterAll(async () => {
		await factory.cleanup();
	});
	/** A refusal answers what it should and leaves everything the service holds exactly as it was. */
	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const plan = (revision: number, over: Record<string, unknown> = {}) => ({
		doc: { ...planAt(revision).doc, ...over },
	});

	it("an app with no plan answers revision 0 and no document", async () => {
		const r = await as("olga", "GET", "");
		expect(r.status).toBe(200);
		expect(r.json).toEqual({ revision: 0 });
	});

	it("saves from revision 0, stores revision 1 and reads it back with who saved it", async () => {
		const saved = await as("olga", "PUT", "", plan(0, { northDeg: 90 }));
		expect(saved.status, JSON.stringify(saved.json)).toBe(200);
		expect(saved.json).toMatchObject({ revision: 1, updatedBy: "olga" });
		const read = await as("rita", "GET", "");
		expect(read.json).toMatchObject({ revision: 1, updatedBy: "olga" });
		expect((read.json.doc as { revision: number; northDeg: number }).revision).toBe(1);
		expect((read.json.doc as { northDeg: number }).northDeg).toBe(90);
	});

	it("a plan keeps what was drawn on it, shapes and unicode names included", async () => {
		const shapes = [
			{
				id: "r1",
				kind: "room",
				label: "Cabinet 1",
				geometry: { type: "rect", x: 1, y: 2, w: 30, h: 40 },
			},
		];
		const floors = [{ id: "f1", name: "Etajul întâi — Țară", shapes }];
		const current = (await as("olga", "GET", "")).json.revision as number;
		const saved = await as("olga", "PUT", "", plan(current, { floors }));
		expect(saved.status).toBe(200);
		const read = (await as("olga", "GET", "")).json.doc as { floors: unknown[] };
		expect(read.floors).toEqual(floors);
	});

	it("each save counts the revision up by one", async () => {
		const start = (await as("olga", "GET", "")).json.revision as number;
		for (let i = 0; i < 3; i += 1) {
			const r = await as("olga", "PUT", "", plan(start + i));
			expect(r.json.revision).toBe(start + i + 1);
		}
	});

	it("a save from an older revision is a conflict that names the stored revision, and writes nothing", async () => {
		const stored = (await as("olga", "GET", "")).json.revision as number;
		const r = await refused(() => as("olga", "PUT", "", plan(stored - 1)), 409, "conflict");
		expect(err(r).detail).toEqual({ reason: "stale", revision: stored });
	});

	it("a save from a revision that does not exist yet is a conflict too", async () => {
		const stored = (await as("olga", "GET", "")).json.revision as number;
		await refused(() => as("olga", "PUT", "", plan(stored + 5)), 409, "conflict");
	});

	it("two people saving from the same revision: one wins, the other is told, the plan is the winner's", async () => {
		const stored = (await as("olga", "GET", "")).json.revision as number;
		const [a, b] = await Promise.all([
			as("olga", "PUT", "", plan(stored, { northDeg: 10 })),
			as("nina", "PUT", "", plan(stored, { northDeg: 20 })),
		]);
		expect([a.status, b.status].sort()).toEqual([200, 409]);
		const winner = a.status === 200 ? 10 : 20;
		const read = (await as("olga", "GET", "")).json;
		expect(read.revision).toBe(stored + 1);
		expect((read.doc as { northDeg: number }).northDeg).toBe(winner);
	});

	it("the save is audited with who and which revision", async () => {
		const stored = (await as("olga", "GET", "")).json.revision as number;
		await as("olga", "PUT", "", plan(stored));
		const events = (await w.call("olga", "GET", "/v1/apps/psizone/audit?action=floorplan.put"))
			.json as { items: { actor: { subject: string }; action: string }[] };
		expect(events.items.length).toBeGreaterThan(0);
		expect(events.items[0]).toMatchObject({ action: "floorplan.put", actor: { subject: "olga" } });
	});

	describe("a plan the service refuses is refused whole, and nothing is written", () => {
		const bad: [string, Record<string, unknown>][] = [
			["another version", { version: 2 }],
			["no floors", { floors: [] }],
			[
				"nine floors",
				{ floors: Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, name: "x", shapes: [] })) },
			],
			["a floor with no name", { floors: [{ id: "f1", name: "", shapes: [] }] }],
			[
				"a floor name of 41 characters",
				{ floors: [{ id: "f1", name: "n".repeat(41), shapes: [] }] },
			],
			["a floor id that is not an id", { floors: [{ id: "no spaces", name: "x", shapes: [] }] }],
			[
				"401 shapes on a floor",
				{ floors: [{ id: "f1", name: "x", shapes: Array.from({ length: 401 }, () => ({})) }] },
			],
			["a drawing area of 49", { width: 49 }],
			["a drawing area of 5001", { height: 5001 }],
			["a north of 360", { northDeg: 360 }],
			["a fractional north", { northDeg: 1.5 }],
			["a negative revision inside", { revision: -1 }],
		];
		it.each(bad)("%s", async (_name, over) => {
			await refused(() => as("olga", "PUT", "", plan(0, over)), 400, "invalid");
		});
		it("a plan larger than the service keeps", async () => {
			const big = [
				{
					id: "f1",
					name: "x",
					shapes: Array.from({ length: 400 }, () => ({ pad: "p".repeat(1500) })),
				},
			];
			await refused(() => as("olga", "PUT", "", plan(0, { floors: big })), 400, "invalid");
		});
		it("no document at all", async () => {
			await refused(() => as("olga", "PUT", "", {}), 400, "invalid");
		});
		it("a body that is not JSON", async () => {
			await refused(() => as("olga", "PUT", "", "not json"), 400, "invalid");
		});
	});

	describe("who may", () => {
		it("a person with no role in the app reads and writes nothing", async () => {
			await refused(() => as("blank", "GET", ""), 403, "forbidden");
			await refused(() => as("blank", "PUT", "", plan(0)), 403, "forbidden");
		});
		it("a role that may view the calendar may read the plan but not save it", async () => {
			expect((await as("dora", "GET", "")).status).toBe(200);
			await refused(() => as("dora", "PUT", "", plan(0)), 403, "forbidden");
			await refused(() => as("rita", "PUT", "", plan(0)), 403, "forbidden");
		});
		it("a stranger to the app is told it is not there", async () => {
			await refused(() => as("mallory", "GET", ""), 404, "not_found");
			await refused(() => as("mallory", "PUT", "", plan(0)), 404, "not_found");
		});
		it("no sign-in is refused", async () => {
			await refused(() => as(null, "GET", ""), 401, "unauthenticated");
			await refused(() => as(null, "PUT", "", plan(0)), 401, "unauthenticated");
		});
		it("an app that does not exist is not found", async () => {
			await refused(() => as("root", "PUT", "", plan(0), "nosuchapp"), 404, "not_found");
		});
		it("looking at the app as someone else cannot save", async () => {
			await refused(
				() =>
					w.call("olga", "PUT", "/v1/apps/psizone/floor-plan", plan(0), {
						headers: { "x-psi-view-as": "role:owner" },
					}),
				403,
				"forbidden",
			);
		});
	});

	it("each app has its own plan: another app's save changes nothing here", async () => {
		const before = (await as("olga", "GET", "")).json;
		const saved = await as("hugo", "PUT", "", plan(0, { northDeg: 45 }), "hemisync");
		expect(saved.status).toBe(200);
		expect((await as("hugo", "GET", "", undefined, "hemisync")).json.revision).toBe(1);
		expect((await as("olga", "GET", "")).json).toEqual(before);
		await refused(() => as("olga", "GET", "", undefined, "hemisync"), 404, "not_found");
	});
});
