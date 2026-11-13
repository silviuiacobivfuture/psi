import { beforeAll, describe, expect, it } from "vitest";
import { StoreRefused } from "../types";
import type { ContractSection } from "./env";

/** The engagement store: small keyed documents by namespace, with the same compare-and-set as a document. */
export const keyedContract: ContractSection = (env) => {
	let app: string;
	beforeAll(async () => {
		app = await env().newApp();
	});
	const keyed = () => env().store.keyed;
	const refused = async (reason: string, run: () => Promise<unknown>): Promise<void> => {
		const error = await run().then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(StoreRefused);
		expect((error as StoreRefused).reason).toBe(reason);
	};

	describe("keyed engagement store", () => {
		it("an entry nobody saved is absent", async () => {
			expect(await keyed().get(app, "invite", "c-none")).toBeUndefined();
		});
		it("a first save is from revision 0 and reads back", async () => {
			const saved = await keyed().put(app, "invite", "c-one", 0, '{"a":1}');
			expect(saved.revision).toBe(1);
			expect(await keyed().get(app, "invite", "c-one")).toEqual({
				key: "c-one",
				body: '{"a":1}',
				revision: 1,
				updatedAt: saved.updatedAt,
			});
		});
		it("each save counts up by one and replaces the body", async () => {
			expect((await keyed().put(app, "invite", "c-one", 1, '{"a":2}')).revision).toBe(2);
			expect((await keyed().get(app, "invite", "c-one"))?.body).toBe('{"a":2}');
		});
		it("a save from another revision is stale and changes nothing", async () => {
			await refused("stale", () => keyed().put(app, "invite", "c-one", 1, '{"late":true}'));
			await refused("stale", () => keyed().put(app, "invite", "c-one", 9, '{"early":true}'));
			await refused("stale", () => keyed().put(app, "invite", "c-one", 0, "{}"));
			expect(await keyed().get(app, "invite", "c-one")).toMatchObject({
				revision: 2,
				body: '{"a":2}',
			});
		});
		it("two saves from the same revision: one wins", async () => {
			const results = await Promise.allSettled([
				keyed().put(app, "prefs", "p-race", 0, '{"w":"a"}'),
				keyed().put(app, "prefs", "p-race", 0, '{"w":"b"}'),
			]);
			expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
			expect((await keyed().get(app, "prefs", "p-race"))?.revision).toBe(1);
		});
		it("namespaces do not see each other's keys", async () => {
			await keyed().put(app, "prefs", "same-key", 0, '{"p":1}');
			expect(await keyed().get(app, "link", "same-key")).toBeUndefined();
			await keyed().put(app, "link", "same-key", 0, '{"l":1}');
			expect((await keyed().get(app, "prefs", "same-key"))?.body).toBe('{"p":1}');
		});
		it("lists by prefix in key order, honours the limit, and never mixes namespaces or apps", async () => {
			const other = await env().newApp();
			for (const k of ["h1/c", "h1/a", "h1/b", "h2/a"]) await keyed().put(app, "link", k, 0, "{}");
			await keyed().put(other, "link", "h1/z", 0, "{}");
			await keyed().put(app, "delivery", "h1/d", 0, "{}");
			expect((await keyed().list(app, "link", { prefix: "h1/" })).map((e) => e.key)).toEqual([
				"h1/a",
				"h1/b",
				"h1/c",
			]);
			expect(await keyed().list(app, "link", { prefix: "h1/", limit: 2 })).toHaveLength(2);
			expect((await keyed().list(app, "link", { prefix: "h3/" })).length).toBe(0);
			expect((await keyed().list(other, "link", { prefix: "h1/" })).map((e) => e.key)).toEqual([
				"h1/z",
			]);
		});
		it("removes an entry once and says so", async () => {
			await keyed().put(app, "link", "gone/x", 0, "{}");
			expect(await keyed().remove(app, "link", "gone/x")).toBe(true);
			expect(await keyed().remove(app, "link", "gone/x")).toBe(false);
			expect(await keyed().get(app, "link", "gone/x")).toBeUndefined();
		});
		it("a bad key, a bad revision or an oversized body is invalid and writes nothing", async () => {
			await refused("invalid", () => keyed().put(app, "invite", "bad key", 0, "{}"));
			await refused("invalid", () => keyed().put(app, "invite", "", 0, "{}"));
			await refused("invalid", () => keyed().put(app, "invite", "k-neg", -1, "{}"));
			await refused("invalid", () => keyed().put(app, "invite", "k-frac", 1.5, "{}"));
			await refused("invalid", () => keyed().put(app, "invite", "k-big", 0, "x".repeat(16_001)));
			expect(await keyed().get(app, "invite", "k-big")).toBeUndefined();
			await keyed().put(app, "invite", "k-edge", 0, "x".repeat(16_000));
			expect((await keyed().get(app, "invite", "k-edge"))?.body).toHaveLength(16_000);
		});
		it("an app that is not there is not found, and nothing is written", async () => {
			await refused("not_found", () => keyed().put("test-no-such-app", "invite", "k", 0, "{}"));
			expect(await keyed().get("test-no-such-app", "invite", "k")).toBeUndefined();
		});
		it("an app sees only its own entries", async () => {
			const other = await env().newApp();
			expect(await keyed().get(other, "invite", "c-one")).toBeUndefined();
		});
	});
};
