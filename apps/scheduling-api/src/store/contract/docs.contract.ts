import { beforeAll, describe, expect, it } from "vitest";
import { withActor } from "../actor";
import { StoreRefused } from "../types";
import type { ContractSection } from "./env";

/** Documents with a revision: the compare-and-set that keeps two people's saves from overwriting each other. */
export const docsContract: ContractSection = (env) => {
	let app: string;
	beforeAll(async () => {
		app = await env().newApp();
	});
	const docs = () => env().store.docs;
	const refused = async (reason: string, run: () => Promise<unknown>): Promise<void> => {
		const error = await run().then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(StoreRefused);
		expect((error as StoreRefused).reason).toBe(reason);
	};

	describe("documents", () => {
		it("a document nobody saved is absent", async () => {
			expect(await docs().get(app, "floor_plan")).toBeUndefined();
		});
		it("a first save is from revision 0, and is read back with who saved it", async () => {
			const saved = await withActor("rita", () => docs().put(app, "floor_plan", 0, '{"a":1}'));
			expect(saved.revision).toBe(1);
			expect(await docs().get(app, "floor_plan")).toMatchObject({
				revision: 1,
				body: '{"a":1}',
				updatedBy: "rita",
				updatedAt: saved.updatedAt,
			});
		});
		it("each save counts up by one and replaces the body", async () => {
			const second = await withActor("olga", () => docs().put(app, "floor_plan", 1, '{"a":2}'));
			expect(second.revision).toBe(2);
			expect(await docs().get(app, "floor_plan")).toMatchObject({
				revision: 2,
				body: '{"a":2}',
				updatedBy: "olga",
			});
		});
		it("a save from an older revision is stale and changes nothing", async () => {
			await refused("stale", () => docs().put(app, "floor_plan", 1, '{"a":"late"}'));
			expect(await docs().get(app, "floor_plan")).toMatchObject({ revision: 2, body: '{"a":2}' });
		});
		it("a save from a revision ahead of the stored one is stale too", async () => {
			await refused("stale", () => docs().put(app, "floor_plan", 9, '{"a":"early"}'));
			expect((await docs().get(app, "floor_plan"))?.revision).toBe(2);
		});
		it("a second save from revision 0 once one exists is stale", async () => {
			await refused("stale", () => docs().put(app, "floor_plan", 0, "{}"));
		});
		it("two saves from the same revision: one wins", async () => {
			const results = await Promise.allSettled([
				docs().put(app, "floor_plan", 2, '{"w":"a"}'),
				docs().put(app, "floor_plan", 2, '{"w":"b"}'),
			]);
			expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
			expect((await docs().get(app, "floor_plan"))?.revision).toBe(3);
		});
		it("a negative or fractional revision is invalid", async () => {
			await refused("invalid", () => docs().put(app, "floor_plan", -1, "{}"));
			await refused("invalid", () => docs().put(app, "floor_plan", 1.5, "{}"));
		});
		it("a body past the store's bound is invalid, and one at the bound is kept", async () => {
			const other = await env().newApp();
			await refused("invalid", () => docs().put(other, "floor_plan", 0, "x".repeat(512_001)));
			expect(await docs().get(other, "floor_plan")).toBeUndefined();
			await docs().put(other, "floor_plan", 0, "x".repeat(512_000));
			expect((await docs().get(other, "floor_plan"))?.body).toHaveLength(512_000);
		});
		it("an app that is not there is not found", async () => {
			await refused("not_found", () => docs().put("test-no-such-app", "floor_plan", 0, "{}"));
		});
		it("an app sees only its own document", async () => {
			const other = await env().newApp();
			expect(await docs().get(other, "floor_plan")).toBeUndefined();
		});
	});
};
