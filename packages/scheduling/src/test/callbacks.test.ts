import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { CallbackInput, CallbacksStaff } from "../callbacks-client";
import { createSchedulingClient, type SchedulingClient } from "../client";
import type { SchedulingConfig } from "../config";
import { createStaffSchedulingClient } from "../staff-client";

/**
 * Callback requests against the real local backend (README), in throwaway `test-callbacks-…`
 * tenants (dropped afterwards). The retention run is the deployment's own internal function.
 */

const PKG = resolve(import.meta.dirname, "../..");
const KEY_FILE = resolve(PKG, "../../.data/convex/secrets/server-key");
const URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const reachable = await fetch(`${URL}/version`, { signal: AbortSignal.timeout(2_000) })
	.then((res) => res.ok)
	.catch(() => false);
const ready = reachable && existsSync(KEY_FILE) && existsSync(join(dirname(KEY_FILE), "admin-key"));
if (!ready)
	console.warn(`callbacks.test: no local backend at ${URL}; see packages/scheduling/README.md`);

const STAMP = Date.now().toString(36);
const TENANT = `test-callbacks-${STAMP}`;
const OTHER = `test-callbacks-other-${STAMP}`;
const DAY = 24 * 60 * 60_000;

function convexRun(fn: string, args: Record<string, unknown>): unknown {
	const out = execFileSync(join(PKG, "scripts/convex.sh"), ["run", fn, JSON.stringify(args)], {
		cwd: PKG,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return out.trim() === "" ? null : JSON.parse(out);
}

function config(serverKey?: string): SchedulingConfig {
	return {
		url: URL,
		serverKey: serverKey ?? readFileSync(KEY_FILE, "utf8").trim(),
		timeoutMs: 10_000,
	};
}

const visitor = (over: Partial<CallbackInput> = {}): CallbackInput => ({
	tenant: TENANT,
	contact: { name: "DEMO Callback", phone: "0700 000 000" },
	audience: "child",
	when: "morning",
	locale: "ro",
	channel: "form",
	page: "/contact",
	consent: true,
	...over,
});

describe.skipIf(!ready)("callback requests on the local Convex", () => {
	let client: SchedulingClient;
	let staff: CallbacksStaff;

	beforeAll(() => {
		client = createSchedulingClient(config());
		staff = createStaffSchedulingClient(config());
		convexRun("seed:fixture", { tenant: TENANT });
		convexRun("seed:fixture", { tenant: OTHER });
	});

	afterAll(() => {
		for (const tenant of [TENANT, OTHER]) {
			convexRun("callbacks:dropFixture", { tenant });
			convexRun("seed:dropFixture", { tenant });
		}
	});

	it("stores a request and lists it new, with its fields, for its own tenant only", async () => {
		const made = await client.requestCallback(
			visitor({ service: "race", preferredStart: Date.now() + DAY, channel: "guide" }),
		);
		expect(made.ok).toBe(true);
		await client.requestCallback(
			visitor({ tenant: OTHER, contact: { name: "DEMO Other", phone: "0700 000 001" } }),
		);
		const listed = await staff.callbacks({ tenant: TENANT });
		if (!listed.ok) throw new Error(listed.reason);
		expect(listed.callbacks).toHaveLength(1);
		expect(listed.callbacks[0]).toMatchObject({
			status: "new",
			audience: "child",
			when: "morning",
			locale: "ro",
			channel: "guide",
			page: "/contact",
			service: "race",
			contact: { name: "DEMO Callback", phone: "0700 000 000" },
		});
	});

	it("refuses without consent, an invalid contact and an unknown tenant, writing nothing", async () => {
		const before = await staff.callbacks({ tenant: TENANT });
		expect(await client.requestCallback(visitor({ consent: false }))).toEqual({
			ok: false,
			reason: "no_consent",
		});
		expect(await client.requestCallback(visitor({ contact: { name: "DEMO Callback" } }))).toEqual({
			ok: false,
			reason: "invalid",
		});
		for (const contact of [
			{ name: "DEMO Callback", phone: "0700 000 000", age: 121 },
			{ name: "DEMO Callback", phone: "0700 000 000", age: -1 },
			{ name: "DEMO Callback", phone: "0700 000 000", details: "scurt" },
			{ name: "DEMO Callback", phone: "0700 000 000", details: "x".repeat(2001) },
		]) {
			const refused = await client.requestCallback(visitor({ contact })).catch(() => "refused");
			expect(refused === "refused" || (typeof refused !== "string" && !refused.ok)).toBe(true);
		}
		expect(await client.requestCallback(visitor({ tenant: "test-callbacks-nobody" }))).toEqual({
			ok: false,
			reason: "unknown_tenant",
		});
		expect(await staff.callbacks({ tenant: TENANT })).toEqual(before);
	});

	it("the store itself refuses consent false (a crafted client), and a wrong key", async () => {
		const bad = createSchedulingClient(config("x".repeat(40)));
		await expect(bad.requestCallback(visitor())).rejects.toThrow(/refused the server key/);
		const raw = z.object({ ok: z.boolean(), reason: z.string() }).parse(
			convexRun("callbacks:create", {
				key: readFileSync(KEY_FILE, "utf8").trim(),
				tenant: TENANT,
				contact: { name: "DEMO Callback", phone: "0700 000 000" },
				audience: "adult",
				when: "any",
				locale: "ro",
				channel: "form",
				page: "/contact",
				consent: false,
			}),
		);
		expect(raw).toEqual({ ok: false, reason: "no_consent" });
	});

	it("marks handled once, keeps who and when on a second mark, and refuses another tenant's id", async () => {
		const made = await client.requestCallback(
			visitor({ contact: { name: "DEMO Handle", phone: "0700 000 002" } }),
		);
		if (!made.ok) throw new Error(made.reason);
		const actor = { subject: "test-callbacks-subject" };
		expect(await staff.markCallbackHandled({ tenant: OTHER, id: made.id, actor })).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect(await staff.markCallbackHandled({ tenant: TENANT, id: made.id, actor })).toEqual({
			ok: true,
		});
		const first = await staff.callbacks({ tenant: TENANT, status: "handled" });
		if (!first.ok) throw new Error(first.reason);
		const row = first.callbacks.find((c) => c.id === made.id);
		expect(row).toMatchObject({ status: "handled", handledBy: actor.subject });
		await staff.markCallbackHandled({
			tenant: TENANT,
			id: made.id,
			actor: { subject: "someone-else" },
		});
		const again = await staff.callbacks({ tenant: TENANT, status: "handled" });
		if (!again.ok) throw new Error(again.reason);
		expect(again.callbacks.find((c) => c.id === made.id)).toEqual(row);
		const fresh = await staff.callbacks({ tenant: TENANT, status: "new" });
		if (!fresh.ok) throw new Error(fresh.reason);
		expect(fresh.callbacks.map((c) => c.id)).not.toContain(made.id);
	});

	it("retention erases the contact of an old handled request, keeps an unhandled one, deletes a year-old one", async () => {
		const mk = async (name: string) => {
			const made = await client.requestCallback(
				visitor({
					contact: { name, phone: "0700 000 003", age: 30, details: "Detalii personale de test." },
				}),
			);
			if (!made.ok) throw new Error(made.reason);
			return made.id;
		};
		const handledOld = await mk("DEMO Handled Old");
		const newOld = await mk("DEMO New Old");
		const ancient = await mk("DEMO Ancient");
		const now = Date.now();
		const actor = { subject: "test-callbacks-subject" };
		await staff.markCallbackHandled({ tenant: TENANT, id: handledOld, actor });
		convexRun("callbacks:ageFixture", {
			id: handledOld,
			createdAt: now - 60 * DAY,
			handledAt: now - 31 * DAY,
		});
		convexRun("callbacks:ageFixture", { id: newOld, createdAt: now - 60 * DAY });
		convexRun("callbacks:ageFixture", { id: ancient, createdAt: now - 366 * DAY });
		convexRun("retention:purge", {});
		const all = await staff.callbacks({ tenant: TENANT, limit: 200 });
		if (!all.ok) throw new Error(all.reason);
		const byId = new Map(all.callbacks.map((c) => [c.id, c]));
		expect(byId.get(handledOld)?.contact).toBeUndefined();
		expect(byId.get(handledOld)?.status).toBe("handled");
		expect(byId.get(newOld)?.contact).toMatchObject({
			name: "DEMO New Old",
			age: 30,
			details: "Detalii personale de test.",
		});
		expect(byId.has(ancient)).toBe(false);
	});
});
