import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { harness, result } from "./api-harness";
import { callMutation, callQuery } from "./server";

/**
 * Web requests beyond the booking list, against the local backend in a throwaway app: the callbacks of slice 0 as
 * requests, "called back" once, the count waiting, and the live feed of what arrived or changed. Each function is refused
 * without the key (writing nothing).
 */
if (!backendReady) console.warn("web-requests.test: no local backend; see README");

const { TENANT, mut, qry } = harness("webreq");
const contact = { name: "Caller Test", phone: "0712 345 678" };
const form = {
	contact,
	audience: "adult",
	when: "any",
	locale: "ro",
	channel: "form",
	page: "/contact",
	consent: true,
};

describe.skipIf(!backendReady)("callbacks as web requests, and the live feed", () => {
	let reference = "";
	beforeAll(async () => {
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "T", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.unknown(),
		);
		const made = result.parse(await callMutation("callbacks:create", { tenant: TENANT, ...form }));
		reference = z.string().parse(made.id);
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("lists it with its id as the reference, counts it as waiting, and feeds it", async () => {
		const list = await qry("webRequests:callbacks", { from: 0, to: Date.now() + 1000 });
		expect(list.callbacks).toEqual([
			expect.objectContaining({ reference, status: "new", contact }),
		]);
		expect((await qry("webRequests:pending", { from: 0 })).count).toBe(1);
		const feed = await qry("webRequests:feed", { cursor: 0 });
		expect((feed.changes as { reference: string }[]).map((c) => c.reference)).toEqual([reference]);
		const later = await qry("webRequests:feed", { cursor: Number(feed.cursor) });
		expect(later.changes).toEqual([]);
	});

	it("knows a callback from anything else, and does not cross apps", async () => {
		expect((await qry("webRequests:isCallback", { reference })).found).toBe(true);
		expect((await qry("webRequests:isCallback", { reference: "ZZZZ-ZZZZ" })).found).toBe(false);
		const other = result.parse(
			await callQuery("webRequests:isCallback", { tenant: `${TENANT}-other`, reference }),
		);
		expect(other.found).toBe(false);
		const none = result.parse(
			await callQuery("webRequests:callbacks", {
				tenant: `${TENANT}-other`,
				from: 0,
				to: Date.now() + 1000,
			}),
		);
		expect(none.callbacks).toEqual([]);
	});

	it("is called back once: it no longer waits, the feed says so, and a second time is refused", async () => {
		const cursor = Date.now() - 1;
		await mut("webRequests:handleCallback", { reference }, { audit: 0 });
		expect((await qry("webRequests:pending", { from: 0 })).count).toBe(0);
		const feed = await qry("webRequests:feed", { cursor });
		expect((feed.changes as unknown[]).length).toBe(1);
		const again = await mut("webRequests:handleCallback", { reference }, { audit: 0, ok: false });
		expect(again.reason).toBe("not_allowed");
		const unknown = await mut(
			"webRequests:handleCallback",
			{ reference: "not-an-id-at-all" },
			{ audit: 0, ok: false },
		);
		expect(unknown.reason).toBe("not_found");
	});

	it("refuses the wrappers without the key and writes nothing", async () => {
		const args = { tenant: TENANT, reference };
		await expect(
			callMutation("webRequests:handleCallback", { ...args, actor: { subject: "x" } }, null),
		).rejects.toThrow();
		await expect(
			callQuery("webRequests:pending", { tenant: TENANT, from: 0 }, "x".repeat(40)),
		).rejects.toThrow();
	});
});
