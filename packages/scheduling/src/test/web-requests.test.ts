import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { harness, result } from "./api-harness";
import { callMutation, callQuery } from "./server";

/**
 * Callback requests and the live feed of web requests, against the local backend in a throwaway app: each function is
 * refused without the key (writing nothing); with it, a callback is stored once, listed, counted, decided, and the feed
 * names what changed after a cursor.
 */
if (!backendReady) console.warn("web-requests.test: no local backend; see README");

const { TENANT, mut, qry } = harness("webreq");
const contact = { name: "Caller Test", phone: "0712 345 678" };

describe.skipIf(!backendReady)("callback requests and the web-request feed", () => {
	let reference = "";
	beforeAll(async () => {
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "T", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.unknown(),
		);
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("is refused without the key and writes nothing; with it a callback is stored once", async () => {
		const args = { tenant: TENANT, contact, locale: "ro" };
		await expect(callMutation("webRequests:submitCallback", args, null)).rejects.toThrow();
		await expect(
			callMutation("webRequests:submitCallback", args, "x".repeat(40)),
		).rejects.toThrow();
		expect(
			result.parse(await callQuery("webRequests:pending", { tenant: TENANT, from: 0 })).count,
		).toBe(0);
		const out = result.parse(await callMutation("webRequests:submitCallback", args));
		reference = z.string().parse(out.reference);
		expect(reference).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
	});

	it("refuses a callback with no way to reach the caller, and an app that does not exist", async () => {
		const bad = result.parse(
			await callMutation("webRequests:submitCallback", {
				tenant: TENANT,
				contact: { name: "No Contact" },
				locale: "ro",
			}),
		);
		expect(bad).toEqual({ ok: false, reason: "invalid" });
		const nowhere = result.parse(
			await callMutation("webRequests:submitCallback", {
				tenant: "nowhere",
				contact,
				locale: "ro",
			}),
		);
		expect(nowhere).toEqual({ ok: false, reason: "unknown_tenant" });
		expect(
			result.parse(await callQuery("webRequests:pending", { tenant: TENANT, from: 0 })).count,
		).toBe(1);
	});

	it("lists, counts and feeds it", async () => {
		const list = await qry("webRequests:callbacks", { from: 0, to: Date.now() + 1000 });
		expect(list.callbacks).toEqual([
			expect.objectContaining({ reference, status: "open", contact }),
		]);
		expect((await qry("webRequests:pending", { from: 0 })).count).toBe(1);
		const feed = await qry("webRequests:feed", { cursor: 0 });
		expect((feed.changes as { reference: string }[]).map((c) => c.reference)).toEqual([reference]);
		const later = await qry("webRequests:feed", { cursor: Number(feed.cursor) });
		expect(later.changes).toEqual([]);
	});

	it("is decided once: declined, then it no longer waits, and a second decision is refused", async () => {
		await mut(
			"webRequests:decideCallback",
			{
				reference,
				decision: "decline",
				reason: "no_response",
			},
			{ audit: 0 },
		);
		expect((await qry("webRequests:pending", { from: 0 })).count).toBe(0);
		const again = await mut(
			"webRequests:decideCallback",
			{ reference, decision: "cancel" },
			{ audit: 0, ok: false },
		);
		expect(again.reason).toBe("not_allowed");
		const other = await mut(
			"webRequests:decideCallback",
			{ reference: "ZZZZ-ZZZZ", decision: "cancel" },
			{ audit: 0, ok: false },
		);
		expect(other.reason).toBe("not_found");
		// the change shows in the feed after the earlier cursor
		const feed = await qry("webRequests:feed", { cursor: 0 });
		expect((feed.changes as unknown[]).length).toBe(1);
	});

	it("does not cross apps", async () => {
		const out = await callQuery("webRequests:callbacks", {
			tenant: `${TENANT}-other`,
			from: 0,
			to: Date.now() + 1000,
		});
		expect(result.parse(out).callbacks).toEqual([]);
	});
});
