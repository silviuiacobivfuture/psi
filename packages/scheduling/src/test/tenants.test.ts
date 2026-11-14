import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createSchedulingClient, type HoldInput, type OfferedSlot } from "../client";
import type { SchedulingConfig } from "../config";
import { CONVEX_DATA, CONVEX_URL } from "./backend";

/**
 * Tenant isolation against the real local backend (README), in two throwaway tenants that each
 * have the SAME service key ("race") and their own practitioner: a slot, a hold or a service of
 * one tenant can never reference a practitioner or a service of the other. The test skips, like
 * convex.test.ts, when there is no local backend with its key files.
 */

const PKG = resolve(import.meta.dirname, "../..");
const KEY_FILE = join(CONVEX_DATA, "secrets/server-key");
const URL = CONVEX_URL;
const reachable = await fetch(`${URL}/version`, { signal: AbortSignal.timeout(2_000) })
	.then((res) => res.ok)
	.catch(() => false);
const ready = reachable && existsSync(KEY_FILE) && existsSync(join(dirname(KEY_FILE), "admin-key"));
if (!ready)
	console.warn(`tenants.test: no local backend at ${URL}; see packages/scheduling/README.md`);

const STAMP = Date.now().toString(36);
const A = `test-iso-a-${STAMP}`;
const B = `test-iso-b-${STAMP}`;
const DAY = 24 * 60 * 60_000;

function convexRun(fn: string, args: Record<string, string>): unknown {
	const out = execFileSync(join(PKG, "scripts/convex.sh"), ["run", fn, JSON.stringify(args)], {
		cwd: PKG,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return JSON.parse(out);
}

const config = (): SchedulingConfig => ({
	url: URL,
	serverKey: readFileSync(KEY_FILE, "utf8").trim(),
	timeoutMs: 10_000,
});

async function free(tenant: string): Promise<ReadonlyArray<OfferedSlot>> {
	const now = Date.now();
	const found = await createSchedulingClient(config()).findSlots({
		tenant,
		service: "race",
		from: now + 2 * DAY,
		to: now + 3 * DAY,
		mode: "onsite",
	});
	if (!found.ok) throw new Error(found.reason);
	return found.slots;
}

const holdOf = (
	tenant: string,
	slot: { practitioner: string; start: number },
	over: Partial<HoldInput> = {},
): HoldInput => ({
	tenant,
	service: "race",
	practitioner: slot.practitioner,
	start: slot.start,
	mode: "onsite",
	locale: "ro",
	channel: "form",
	...over,
});

describe.skipIf(!ready)("a tenant's calendar is its own", () => {
	const practitioner: Record<string, string> = {};

	beforeAll(() => {
		for (const tenant of [A, B]) {
			practitioner[tenant] = z
				.object({ practitioner: z.string() })
				.parse(convexRun("seed:fixture", { tenant })).practitioner;
		}
	});

	afterAll(() => {
		for (const tenant of [A, B]) convexRun("seed:dropFixture", { tenant });
	});

	it("offers each tenant only its own practitioner's times", async () => {
		const [mine, theirs] = [await free(A), await free(B)];
		expect(mine.length).toBeGreaterThan(0);
		expect(theirs.length).toBeGreaterThan(0);
		expect(new Set(mine.map((s) => s.practitioner))).toEqual(new Set([practitioner[A]]));
		expect(new Set(theirs.map((s) => s.practitioner))).toEqual(new Set([practitioner[B]]));
	});

	it("refuses a hold in one tenant on the other tenant's practitioner, both ways, and holds nothing", async () => {
		const client = createSchedulingClient(config());
		const [a, b] = [(await free(A))[10], (await free(B))[10]];
		if (a === undefined || b === undefined) throw new Error("no slot");
		const crossed = await client.hold(holdOf(A, b));
		expect(crossed).toEqual({ ok: false, reason: "unknown_service" });
		const back = await client.hold(holdOf(B, a));
		expect(back).toEqual({ ok: false, reason: "unknown_service" });
		// Neither time left either calendar.
		expect((await free(A)).some((s) => s.start === a.start)).toBe(true);
		expect((await free(B)).some((s) => s.start === b.start)).toBe(true);
	});

	it("refuses a service the tenant does not have, and a tenant that does not exist", async () => {
		const client = createSchedulingClient(config());
		const [a] = await free(A);
		if (a === undefined) throw new Error("no slot");
		expect(await client.hold(holdOf(A, a, { service: "only-in-the-other" }))).toEqual({
			ok: false,
			reason: "unknown_service",
		});
		expect(await client.hold(holdOf(`${A}-nobody`, a))).toEqual({
			ok: false,
			reason: "unknown_service",
		});
		const found = await client.findSlots({
			tenant: `${A}-nobody`,
			service: "race",
			from: Date.now(),
			to: Date.now() + DAY,
		});
		expect(found).toEqual({ ok: false, reason: "unknown_service" });
	});

	it("refuses the other tenant's person even when a service wrongly lists them, in the offer and in the hold", async () => {
		const client = createSchedulingClient(config());
		const foreign = practitioner[B];
		if (foreign === undefined) throw new Error("no fixture");
		const [b] = (await free(B)).slice(30, 31);
		if (b === undefined) throw new Error("no slot");
		convexRun("seed:fixtureForeign", { tenant: A, foreign });
		expect((await free(A)).filter((s) => s.practitioner === foreign)).toEqual([]);
		expect(await client.hold(holdOf(A, b))).toEqual({ ok: false, reason: "unknown_service" });
		expect((await free(B)).some((s) => s.start === b.start)).toBe(true);
	});

	it("still holds a tenant's own time (the refusals above were about the tenant, not the ids)", async () => {
		const client = createSchedulingClient(config());
		const [a] = (await free(A)).slice(20, 21);
		if (a === undefined) throw new Error("no slot");
		const held = await client.hold(holdOf(A, a));
		expect(held.ok).toBe(true);
		expect((await free(B)).some((s) => s.start === a.start)).toBe(true);
	});
});
