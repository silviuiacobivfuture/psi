import { beforeAll, describe, expect, it } from "vitest";
import { withActor } from "../actor";
import { NO_USAGE, type UsageKey } from "../ports-assistant";
import { StoreRefused } from "../types";
import type { ContractSection } from "./env";

/** The assistants' estate document and meters: what both stores must do alike. */
export const assistantContract: ContractSection = (env) => {
	let app: string;
	let other: string;
	beforeAll(async () => {
		app = await env().newApp();
		other = await env().newApp();
	});
	const refused = async (reason: string, run: () => Promise<unknown>): Promise<void> => {
		const error = await run().then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(StoreRefused);
		expect(error instanceof StoreRefused ? error.reason : "").toBe(reason);
	};
	const month: UsageKey = { surface: "staff", period: "2026-11", scope: "org" };
	const day: UsageKey = { surface: "staff", period: "2026-11-14", scope: "org" };
	const mine: UsageKey = { surface: "staff", period: "2026-11-14", scope: "sub:rita" };
	const one = { ...NO_USAGE, messages: 1, inputTokens: 100, outputTokens: 20, costMicroUsd: 7 };

	describe("the estate's document", () => {
		it("is saved with optimistic concurrency, whatever its revision held before", async () => {
			const held = (await env().store.platform.get("assistant_platform"))?.revision ?? 0;
			const saved = await withActor("root", () =>
				env().store.platform.put("assistant_platform", held, '{"x":1}'),
			);
			expect(saved.revision).toBe(held + 1);
			expect(await env().store.platform.get("assistant_platform")).toMatchObject({
				revision: held + 1,
				body: '{"x":1}',
				updatedBy: "root",
			});
			await refused("stale", () => env().store.platform.put("assistant_platform", held, '{"x":2}'));
			await refused("invalid", () => env().store.platform.put("assistant_platform", -1, "{}"));
		});
	});

	describe("an organisation's configuration document", () => {
		it("is its own kind beside the floor plan: saved, read back, stale from an older revision", async () => {
			expect(await env().store.docs.get(app, "assistant_config")).toBeUndefined();
			const saved = await withActor("rita", () =>
				env().store.docs.put(app, "assistant_config", 0, '{"revision":1}'),
			);
			expect(saved.revision).toBe(1);
			expect(await env().store.docs.get(app, "assistant_config")).toMatchObject({
				revision: 1,
				body: '{"revision":1}',
				updatedBy: "rita",
			});
			expect(await env().store.docs.get(app, "floor_plan")).toBeUndefined();
			expect(await env().store.docs.get(other, "assistant_config")).toBeUndefined();
			await refused("stale", () =>
				env().store.docs.put(app, "assistant_config", 0, '{"revision":1}'),
			);
			expect((await env().store.docs.get(app, "assistant_config"))?.body).toBe('{"revision":1}');
		});
	});

	describe("the meters", () => {
		it("nothing recorded reads as zeros, key by key", async () => {
			expect(await env().store.usage.read(app, [month, day])).toEqual([NO_USAGE, NO_USAGE]);
		});
		it("a turn adds to every key it names at once, and only there", async () => {
			await env().store.usage.add(app, [month, day, mine], one);
			await env().store.usage.add(app, [month, day], one);
			const [m, d, own] = await env().store.usage.read(app, [month, day, mine]);
			expect(m).toEqual({
				...NO_USAGE,
				messages: 2,
				inputTokens: 200,
				outputTokens: 40,
				costMicroUsd: 14,
			});
			expect(d).toEqual(m);
			expect(own).toEqual(one);
			expect(await env().store.usage.read(other, [month])).toEqual([NO_USAGE]);
			expect(await env().store.usage.read(app, [{ ...month, surface: "visitor" }])).toEqual([
				NO_USAGE,
			]);
		});
		it("a negative or fractional count is refused and adds nothing", async () => {
			const before = await env().store.usage.read(app, [month]);
			await refused("invalid", () => env().store.usage.add(app, [month], { ...one, messages: -1 }));
			await refused("invalid", () =>
				env().store.usage.add(app, [month], { ...one, inputTokens: 0.5 }),
			);
			expect(await env().store.usage.read(app, [month])).toEqual(before);
		});
		it("an app that is not there is refused", async () => {
			await refused("not_found", () => env().store.usage.add("no-such-app-x", [month], one));
		});
	});
};
