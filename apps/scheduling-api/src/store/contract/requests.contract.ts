import { describe, expect, it } from "vitest";
import type { ContractSection } from "./env";

/** Web requests: callbacks (a contact, no slot), the list and the count the badge shows, and a visitor's own history. */
export const requestsSection: ContractSection = (env) => {
	describe("web requests", () => {
		const contact = { name: "Caller Test", phone: "0712 345 678" };

		it("a callback is stored, listed with its contact, and counted as waiting", async () => {
			const { store, newApp } = { store: env().store, newApp: env().newApp };
			const app = await newApp();
			const { reference } = await store.visitor.callback(app, { contact, locale: "ro" });
			expect(reference).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
			const listed = await store.requests.list(app, 0, Date.now() + 60_000);
			expect(listed).toEqual([
				expect.objectContaining({ reference, status: "requested", contact }),
			]);
			expect(await store.requests.pending(app)).toBe(1);
		});

		it("is decided once: cancel or decline end the wait; confirm is not allowed; unknown is not found", async () => {
			const store = env().store;
			const app = await env().newApp();
			const { reference } = await store.visitor.callback(app, { contact, locale: "en" });
			expect(await store.requests.decide(app, reference, "confirm", undefined, "olga")).toEqual({
				ok: false,
				reason: "not_allowed",
			});
			expect(await store.requests.pending(app)).toBe(1);
			expect(await store.requests.decide(app, reference, "decline", "no_response", "olga")).toEqual(
				{
					ok: true,
				},
			);
			expect(await store.requests.pending(app)).toBe(0);
			expect(
				await store.requests.decide(app, reference, "cancel", undefined, "olga"),
			).toMatchObject({
				ok: false,
			});
			expect(await store.requests.decide(app, "ZZZZ-ZZZZ", "cancel", undefined, "olga")).toEqual({
				ok: false,
				reason: "not_found",
			});
			expect((await store.requests.list(app, 0, Date.now() + 60_000))[0]?.status).toBe("declined");
		});

		it("a callback that was called back is handled: it no longer waits, and is listed as handled", async () => {
			const store = env().store;
			const app = await env().newApp();
			const { reference } = await store.visitor.callback(app, { contact, locale: "ro" });
			expect(await store.requests.decide(app, reference, "handle", undefined, "rita")).toEqual({
				ok: true,
			});
			expect(await store.requests.pending(app)).toBe(0);
			expect((await store.requests.list(app, 0, Date.now() + 60_000))[0]?.status).toBe("handled");
			expect(
				await store.requests.decide(app, reference, "handle", undefined, "rita"),
			).toMatchObject({
				ok: false,
			});
		});

		it("requests of one app are never listed, counted or decided in another", async () => {
			const store = env().store;
			const [a, b] = [await env().newApp(), await env().newApp()];
			const { reference } = await store.visitor.callback(a, { contact, locale: "ro" });
			expect(await store.requests.list(b, 0, Date.now() + 60_000)).toEqual([]);
			expect(await store.requests.pending(b)).toBe(0);
			expect(await store.requests.decide(b, reference, "cancel", undefined, "olga")).toEqual({
				ok: false,
				reason: "not_found",
			});
			expect(await store.requests.pending(a)).toBe(1);
		});

		it("a visitor with no requests has none to list, and cannot cancel one that is not theirs", async () => {
			const store = env().store;
			const app = await env().newApp();
			expect(await store.visitor.mine(app, "visitor-1")).toEqual([]);
			expect(await store.visitor.cancelMine(app, "visitor-1", "ABCD-EFGH")).toEqual({
				ok: false,
				reason: "not_found",
			});
		});
	});
};
