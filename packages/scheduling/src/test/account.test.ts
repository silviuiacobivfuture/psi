import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { accountClientOn, accountHashOf } from "../account-client";
import { createSchedulingClient } from "../client";
import type { SchedulingConfig } from "../config";
import { createTransport } from "../transport";

/**
 * A signed-in person's own requests, against the real local backend (README). Allowed AND denied for
 * every path: listing, cancelling, linking with proof, unlinking on erasure.
 */
const PKG = resolve(import.meta.dirname, "../..");
const KEY_FILE = resolve(PKG, "../../.data/convex/secrets/server-key");
const URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const reachable = await fetch(`${URL}/version`, {
	signal: AbortSignal.timeout(2_000),
})
	.then((res) => res.ok)
	.catch(() => false);
const ready = reachable && existsSync(KEY_FILE) && existsSync(join(dirname(KEY_FILE), "admin-key"));

const TENANT = `test-acct-${Date.now().toString(36)}`;
const MIN = 60_000;
const ANA = accountHashOf("local-ana");
const BOGDAN = accountHashOf("local-bogdan");

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

async function book(index: number, accountHash?: string) {
	const client = createSchedulingClient(config());
	const now = Date.now();
	const found = await client.findSlots({
		tenant: TENANT,
		service: "race",
		from: now + 2 * 24 * 60 * MIN,
		to: now + 3 * 24 * 60 * MIN,
		mode: "onsite",
	});
	if (!found.ok) throw new Error(found.reason);
	const slot = found.slots[index];
	if (slot === undefined) throw new Error("no slot");
	const held = await client.hold({
		tenant: TENANT,
		service: "race",
		practitioner: slot.practitioner,
		start: slot.start,
		mode: "onsite",
		locale: "ro",
		channel: "form",
	});
	if (!held.ok) throw new Error(held.reason);
	const sent = await client.submit({
		reference: held.reference,
		holdToken: held.holdToken,
		contact: { name: "DEMO Account", email: "visitor@psi.test" },
		...(accountHash === undefined ? {} : { accountHash }),
	});
	if (!sent.ok) throw new Error(sent.reason);
	return sent;
}

describe.skipIf(!ready)("a person's own requests on the local Convex", () => {
	beforeAll(() => {
		z.object({ practitioner: z.string() }).parse(convexRun("seed:fixture", { tenant: TENANT }));
	});
	afterAll(() => {
		convexRun("seed:dropFixture", { tenant: TENANT });
	});

	it("lists an account's requests to that account only, and refuses a malformed hash", async () => {
		const accounts = accountClientOn(createTransport(config()));
		const mine = await book(3, ANA);
		expect((await accounts.requests(ANA)).map((r) => r.reference)).toContain(mine.reference);
		expect((await accounts.requests(BOGDAN)).map((r) => r.reference)).not.toContain(mine.reference);
		expect(await accounts.requests("not-a-hash")).toEqual([]);
	});

	it("cancels only for the owning account", async () => {
		const accounts = accountClientOn(createTransport(config()));
		const mine = await book(6, ANA);
		expect(await accounts.cancel({ reference: mine.reference, accountHash: BOGDAN })).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect(await accounts.cancel({ reference: mine.reference, accountHash: ANA })).toEqual({
			ok: true,
		});
		const row = (await accounts.requests(ANA)).find((r) => r.reference === mine.reference);
		expect(row?.status).toBe("cancelled");
	});

	it("never links an anonymous request without its cancel code, and links with it", async () => {
		const accounts = accountClientOn(createTransport(config()));
		const anonymous = await book(9);
		expect(
			await accounts.link({
				reference: anonymous.reference,
				cancelCode: "AAAA-AAAA-AAAA-AAAA",
				accountHash: ANA,
			}),
		).toEqual({ ok: false, reason: "not_found" });
		expect((await accounts.requests(ANA)).map((r) => r.reference)).not.toContain(
			anonymous.reference,
		);
		expect(
			await accounts.link({
				reference: anonymous.reference,
				cancelCode: anonymous.cancelCode,
				accountHash: ANA,
			}),
		).toEqual({ ok: true, reference: anonymous.reference });
		// Already linked to Ana: Bogdan cannot take it over, even with the code.
		expect(
			await accounts.link({
				reference: anonymous.reference,
				cancelCode: anonymous.cancelCode,
				accountHash: BOGDAN,
			}),
		).toEqual({ ok: false, reason: "not_found" });
	});

	it("unlinks every request of an erased account and leaves the rows", async () => {
		const accounts = accountClientOn(createTransport(config()));
		const gone = accountHashOf(`local-erased-${Date.now()}`);
		await book(12, gone);
		expect(await accounts.unlink(gone)).toBe(1);
		expect(await accounts.requests(gone)).toEqual([]);
	});
});
