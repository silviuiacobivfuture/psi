import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createSchedulingClient, type OfferedSlot } from "../client";
import type { SchedulingConfig } from "../config";
import { SchedulingUnavailable } from "../transport";
import { CONVEX_DATA, CONVEX_URL } from "./backend";

/**
 * Against the real local backend (README: `scripts/local-backend.sh up && … env`, then deploy).
 * Each run gets its own `test-…` tenant through the internal fixture (admin key, `scripts/convex.sh run`),
 * dropped afterwards. Every hold uses its own client, so nothing is serialised client-side: the
 * only thing standing between two racing holds is Convex's transaction.
 */

const PKG = resolve(import.meta.dirname, "../..");
const KEY_FILE = join(CONVEX_DATA, "secrets/server-key");
const URL = CONVEX_URL;
const reachable = await fetch(`${URL}/version`, { signal: AbortSignal.timeout(2_000) })
	.then((res) => res.ok)
	.catch(() => false);
const ready = reachable && existsSync(KEY_FILE) && existsSync(join(dirname(KEY_FILE), "admin-key"));
if (!ready)
	console.warn(`convex.test: no local backend at ${URL}; see packages/scheduling/README.md`);

const TENANT = `test-${Date.now().toString(36)}`;
const MIN = 60_000;

function convexRun(fn: string, args: Record<string, string>): unknown {
	const out = execFileSync(join(PKG, "scripts/convex.sh"), ["run", fn, JSON.stringify(args)], {
		cwd: PKG,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return JSON.parse(out);
}

function config(serverKey?: string): SchedulingConfig {
	return {
		url: URL,
		serverKey: serverKey ?? readFileSync(KEY_FILE, "utf8").trim(),
		timeoutMs: 10_000,
	};
}

async function freeSlots(): Promise<ReadonlyArray<OfferedSlot>> {
	const now = Date.now();
	const found = await createSchedulingClient(config()).findSlots({
		tenant: TENANT,
		service: "race",
		from: now + 2 * 24 * 60 * MIN,
		to: now + 3 * 24 * 60 * MIN,
		mode: "onsite",
	});
	if (!found.ok) throw new Error(found.reason);
	return found.slots;
}

const holdOf = (slot: { practitioner: string; start: number }) => ({
	tenant: TENANT,
	service: "race",
	practitioner: slot.practitioner,
	start: slot.start,
	mode: "onsite" as const,
	locale: "ro" as const,
	channel: "form" as const,
});

describe.skipIf(!ready)("the scheduling store on the local Convex", () => {
	let practitioner = "";

	beforeAll(() => {
		const made = z
			.object({ practitioner: z.string() })
			.parse(convexRun("seed:fixture", { tenant: TENANT }));
		practitioner = made.practitioner;
	});

	afterAll(() => {
		convexRun("seed:dropFixture", { tenant: TENANT });
	});

	it("gives one identical slot to exactly one of twelve racing holds", async () => {
		const [slot] = (await freeSlots()).slice(8, 9);
		if (slot === undefined) throw new Error("no slot");
		const results = await Promise.all(
			Array.from({ length: 12 }, () => createSchedulingClient(config()).hold(holdOf(slot))),
		);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.reason))).toEqual(
			Array(11).fill("slot_taken"),
		);
		const after = await freeSlots();
		expect(after.some((s) => s.start === slot.start)).toBe(false);
	});

	it("gives overlapping (not identical) slots to exactly one racing hold", async () => {
		const slots = await freeSlots();
		const base = slots[20];
		const shifted = slots.find((s) => base !== undefined && s.start === base.start + 15 * MIN);
		if (base === undefined || shifted === undefined) throw new Error("no overlapping pair");
		const results = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				createSchedulingClient(config()).hold(holdOf(i % 2 === 0 ? base : shifted)),
			),
		);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		const after = new Set((await freeSlots()).map((s) => s.start));
		expect(after.has(base.start)).toBe(false);
		expect(after.has(shifted.start)).toBe(false);
	});

	it("holds, refuses a wrong token, submits, and frees the slot when cancelled with the code", async () => {
		const client = createSchedulingClient(config());
		const [slot] = (await freeSlots()).slice(40, 41);
		if (slot === undefined) throw new Error("no slot");
		const held = await client.hold(holdOf(slot));
		if (!held.ok) throw new Error(held.reason);
		expect(held.expiresAt - Date.now()).toBeGreaterThan(9 * MIN);
		const contact = { name: "DEMO Test", phone: "0700 000 000" };
		const wrong = await client.submit({
			reference: held.reference,
			holdToken: "AAAA-AAAA-AAAA-AAAA",
			contact,
		});
		expect(wrong).toEqual({ ok: false, reason: "not_found" });
		const sent = await client.submit({
			reference: held.reference,
			holdToken: held.holdToken,
			contact,
			audience: "adult",
		});
		if (!sent.ok) throw new Error(sent.reason);
		expect((await freeSlots()).some((s) => s.start === slot.start)).toBe(false);
		expect(await client.release({ reference: held.reference, holdToken: held.holdToken })).toEqual({
			ok: false,
			reason: "not_allowed",
		});
		expect(
			await client.cancel({ reference: held.reference, cancelCode: "AAAA-AAAA-AAAA-AAAA" }),
		).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect(await client.cancel({ reference: held.reference, cancelCode: sent.cancelCode })).toEqual(
			{
				ok: true,
				start: slot.start,
			},
		);
		expect((await freeSlots()).some((s) => s.start === slot.start)).toBe(true);
	});

	it("releases a hold, refuses an off-grid start, another tenant, and a wrong server key", async () => {
		const client = createSchedulingClient(config());
		const [slot] = (await freeSlots()).slice(60, 61);
		if (slot === undefined) throw new Error("no slot");
		const held = await client.hold(holdOf(slot));
		if (!held.ok) throw new Error(held.reason);
		expect(await client.release({ reference: held.reference, holdToken: held.holdToken })).toEqual({
			ok: true,
		});
		expect((await freeSlots()).some((s) => s.start === slot.start)).toBe(true);
		expect(await client.hold({ ...holdOf(slot), start: slot.start + 7 * MIN })).toEqual({
			ok: false,
			reason: "not_offered",
		});
		expect(
			await client.hold({ ...holdOf(slot), tenant: "psizone", service: "evaluation" }),
		).toEqual({
			ok: false,
			reason: "unknown_service",
		});
		expect(practitioner).toBe(slot.practitioner);
		const stranger = createSchedulingClient(config("x".repeat(64)));
		await expect(
			stranger.findSlots({ tenant: TENANT, service: "race", from: 0, to: 1 }),
		).rejects.toBeInstanceOf(SchedulingUnavailable);
	});
});
