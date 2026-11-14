import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createVisitorAssistantStore, type VisitorMeter } from "../assistant-client";
import { backendReady, runMutation } from "./admin";
import { CONVEX_URL } from "./backend";
import { callMutation, callQuery, serverKey } from "./server";

/**
 * The visitor assistant's reads and writes against the local backend (`PSI_CONVEX_PORT`, `PSI_CONVEX_DATA`, README), in
 * a throwaway `test-va-…` app: the estate's and the app's documents as stored, the meters by period in the app's zone,
 * and what is refused (each refusal asserting nothing was counted).
 */
if (!backendReady) console.warn("visitor-assistant-backend.test: no local backend; see README");

const APP = `test-va-${Date.now().toString(36)}`;
const OTHER = `test-vb-${Date.now().toString(36)}`;
const ZERO: VisitorMeter = {
	messages: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHits: 0,
};
const TURN: VisitorMeter = {
	...ZERO,
	messages: 1,
	inputTokens: 900,
	outputTokens: 120,
	cachedTokens: 400,
	costMicroUsd: 37,
};
/** 2026-11-14 23:30 in Bucharest (UTC+2): still the 14th there, already late on the 14th in UTC. */
const LATE = Date.parse("2026-11-14T21:30:00Z");
/** 2026-11-30 22:30 UTC: already 1 December in Bucharest. */
const NEXT_MONTH = Date.parse("2026-11-30T22:30:00Z");

const Ok = z.object({ ok: z.literal(true) }).passthrough();
/** A throwaway estate of this run: the backend's own estate document is never written by a test. */
const ESTATE = `*test-va-${Date.now().toString(36)}`;
const Read = z
	.object({
		ok: z.literal(true),
		platform: z.object({ revision: z.number(), body: z.string() }).nullable(),
	})
	.passthrough();

describe.skipIf(!backendReady)("the visitor assistant's store", () => {
	const store = createVisitorAssistantStore({ url: CONVEX_URL, serverKey, timeoutMs: 10_000 });
	const ensure = (slug: string) =>
		runMutation(
			"clinicApps:ensureApp",
			{ slug, name: "Visitor test", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.unknown(),
		);
	beforeAll(async () => {
		if (!backendReady) return;
		await ensure(APP);
		await ensure(OTHER);
	});
	afterAll(async () => {
		if (!backendReady) return;
		await runMutation("seed:dropFixture", { tenant: APP }, z.unknown());
		await runMutation("seed:dropFixture", { tenant: OTHER }, z.unknown());
		await runMutation("seed:dropFixture", { tenant: ESTATE }, z.unknown());
	});

	it("an app with nothing saved and nothing used reads as no app document and zero meters, in its zone", async () => {
		const read = await store.config(APP, LATE);
		expect(read).toMatchObject({
			timeZone: "Europe/Bucharest",
			period: { month: "2026-11", day: "2026-11-14" },
			org: undefined,
			usage: { month: ZERO, day: ZERO },
		});
	});

	it("the app's own document is read back as stored, and only for that app", async () => {
		const body = JSON.stringify({ revision: 1, visitor: { enabled: false } });
		Ok.parse(
			await callMutation("apiDocuments:put", {
				tenant: APP,
				actor: { subject: "rita" },
				kind: "assistant_config",
				expected: 0,
				body,
			}),
		);
		expect((await store.config(APP, LATE))?.org).toEqual({ revision: 1, body });
		expect((await store.config(OTHER, LATE))?.org).toBeUndefined();
	});

	it("the estate's document is read for every app (a throwaway estate's here, the estate's own untouched)", async () => {
		const before = (await store.config(APP, LATE))?.platform;
		const body = JSON.stringify({ revision: 1 });
		Ok.parse(
			await callMutation("apiAssistant:putPlatform", {
				actor: { subject: "root" },
				kind: "assistant_platform",
				expected: 0,
				body,
				estate: ESTATE,
			}),
		);
		const read = async (tenant: string) =>
			Read.parse(
				await callQuery("apiAssistant:visitorConfig", { tenant, now: LATE, estate: ESTATE }),
			).platform;
		expect(await read(APP)).toEqual({ revision: 1, body });
		expect(await read(OTHER)).toEqual({ revision: 1, body });
		expect((await store.config(APP, LATE))?.platform).toEqual(before);
	});

	it.each([
		"*",
		"estate",
		"test-x",
		"*evil",
		"*test-",
		"*test-UPPER",
	])("an estate that is not a throwaway one (%s) is refused, nothing written", async (estate) => {
		const before = (await store.config(APP, LATE))?.platform;
		const put = await callMutation("apiAssistant:putPlatform", {
			actor: { subject: "root" },
			kind: "assistant_platform",
			expected: 0,
			body: "{}",
			estate,
		});
		expect(put).toEqual({ ok: false, reason: "invalid" });
		expect(
			await callQuery("apiAssistant:getPlatform", { kind: "assistant_platform", estate }),
		).toEqual({ ok: false, reason: "invalid" });
		expect((await store.config(APP, LATE))?.platform).toEqual(before);
	});

	it("a turn adds to the month and the day of the app's zone, never to the staff's meters or another app's", async () => {
		expect(await store.record(APP, TURN, LATE)).toBe("ok");
		expect(await store.record(APP, TURN, LATE)).toBe("ok");
		const read = await store.config(APP, LATE);
		const twice = {
			...TURN,
			messages: 2,
			inputTokens: 1_800,
			outputTokens: 240,
			cachedTokens: 800,
			costMicroUsd: 74,
		};
		expect(read?.usage).toEqual({ month: twice, day: twice });
		expect((await store.config(OTHER, LATE))?.usage).toEqual({ month: ZERO, day: ZERO });
		const staff = z.object({ ok: z.literal(true), counts: z.array(z.unknown()) }).parse(
			await callQuery("apiAssistant:readUsage", {
				tenant: APP,
				keys: [{ surface: "staff", period: "2026-11", scope: "org" }],
			}),
		);
		expect(staff.counts).toEqual([ZERO]);
	});

	it("a refused turn counts as a limit met, not a message", async () => {
		expect(await store.record(APP, { ...ZERO, limitHits: 1 }, LATE)).toBe("ok");
		const read = await store.config(APP, LATE);
		expect(read?.usage.day.limitHits).toBe(1);
		expect(read?.usage.day.messages).toBe(2);
	});

	it("the next local day and month start from zero, though UTC is still in November", async () => {
		const read = await store.config(APP, NEXT_MONTH);
		expect(read?.period).toEqual({ month: "2026-12", day: "2026-12-01" });
		expect(read?.usage).toEqual({ month: ZERO, day: ZERO });
	});

	it("a negative or fractional count is refused and adds nothing", async () => {
		const before = (await store.config(APP, LATE))?.usage;
		expect(await store.record(APP, { ...TURN, messages: -1 }, LATE)).toBe("invalid");
		expect(await store.record(APP, { ...TURN, inputTokens: 0.5 }, LATE)).toBe("invalid");
		const raw = await callMutation("apiAssistant:addVisitorUsage", {
			tenant: APP,
			now: LATE,
			delta: { ...TURN, outputTokens: 0.5 },
		});
		expect(raw).toEqual({ ok: false, reason: "invalid" });
		expect((await store.config(APP, LATE))?.usage).toEqual(before);
	});

	it("an app that is not there reads as undefined and its turn is not counted anywhere", async () => {
		expect(await store.config("test-no-such-app", LATE)).toBeUndefined();
		expect(await store.record("test-no-such-app", TURN, LATE)).toBe("not_found");
	});

	it("without the server key nothing is read or written", async () => {
		await expect(
			callMutation("apiAssistant:addVisitorUsage", { tenant: APP, now: LATE, delta: TURN }, "nope"),
		).rejects.toThrow();
		const wrong = createVisitorAssistantStore({
			url: CONVEX_URL,
			serverKey: "nope",
			timeoutMs: 10_000,
		});
		await expect(wrong.config(APP, LATE)).rejects.toThrow();
		expect((await store.config(APP, LATE))?.usage.day.messages).toBe(2);
	});
});
