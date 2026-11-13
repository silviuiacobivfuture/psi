import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backendReady } from "./admin";
import { actor, HOUR, id } from "./api-harness";
import { clinicWorld } from "./clinic-world";
import { callMutation } from "./server";

/**
 * The blacklist's staff wrappers against the local backend, in throwaway `test-bl-…` apps
 * (synthetic data): create, update, remove, read and the staff banner check. Every refusal is its
 * own case and asserts nothing was written. The gates are in `blacklist-gates.test.ts`.
 */
if (!backendReady) console.warn("blacklist-backend.test: no local backend; see README");

const { a, b, ids, ref, flag, setup, teardown } = clinicWorld("bl");

describe.skipIf(!backendReady)("the blacklist", () => {
	beforeAll(async () => {
		if (backendReady) await setup();
	});
	afterAll(async () => {
		if (backendReady) await teardown();
	});
	describe("create", () => {
		it("stores the phone as E.164 and the e-mail lower-cased, audited once", async () => {
			ids.byPhone = id(
				await flag({
					phone: "0700 000 009",
					email: " Bad@Test.EXAMPLE ",
					name: "Test Bad",
					severity: "block_online",
				}),
			);
			const got = await a.qry("apiBlacklist:get", { entry: ref("byPhone") });
			expect(got.entry).toMatchObject({
				phone: "+40700000009",
				email: "bad@test.example",
				active: true,
				version: 1,
			});
		});

		it("a client alone is enough", async () => {
			ids.byClient = id(await flag({ client: ref("ion"), severity: "warn" }));
		});

		it.each([
			["no client, phone or e-mail", { name: "Only A Name" }, "invalid"],
			["a bad phone", { phone: "123" }, "invalid"],
			["a bad e-mail", { email: "nope" }, "invalid"],
			["an empty reason", { phone: "0700 000 010", reason: "  " }, "invalid"],
			["a reason over 2000", { phone: "0700 000 010", reason: "x".repeat(2001) }, "invalid"],
			[
				"an expiry in the past",
				{ phone: "0700 000 010", expiresAt: Date.now() - HOUR },
				"already_expired",
			],
			["a client of another app", { client: "nope" }, "unknown_client"],
			["the same phone as an active entry", { phone: "+40 700 000 009" }, "exists"],
			["the same e-mail as an active entry", { email: "BAD@test.example" }, "exists"],
		])("refuses %s and writes nothing", async (_label, extra, reason) => {
			const out = await a.mut(
				"apiBlacklist:create",
				{ entry: { reason: "a reason", category: "other", severity: "warn", ...extra } },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe(reason);
		});

		it("rejects a category or severity outside the lists at the validator, writing nothing", async () => {
			const before = await a.counts();
			for (const bad of [{ category: "rude" }, { severity: "ban" }]) {
				await expect(
					callMutation("apiBlacklist:create", {
						tenant: a.TENANT,
						actor,
						entry: {
							reason: "r",
							category: "other",
							severity: "warn",
							phone: "0700 000 010",
							...bad,
						},
					}),
				).rejects.toThrow();
			}
			expect(await a.counts()).toEqual(before);
		});

		it("refuses the same client as an active entry, and writes nothing", async () => {
			const out = await a.mut(
				"apiBlacklist:create",
				{ entry: { reason: "r", category: "other", severity: "warn", client: ref("ion") } },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe("exists");
		});

		it("refuses a stronger severity to a warn-only caller, and writes nothing", async () => {
			for (const severity of ["block_online", "block_all"]) {
				const out = await a.mut(
					"apiBlacklist:create",
					{
						entry: { reason: "r", category: "other", severity, phone: "0700 000 011" },
						limit: "warn_only",
					},
					{ audit: 0, ok: false, same: true },
				);
				expect(out.reason).toBe("severity_not_allowed");
			}
			await flag({ phone: "0700 000 011" }, "warn_only");
		});

		it("refuses a client that belongs to another app", async () => {
			const other = id(
				await b.mut("apiClients:create", {
					client: { kind: "adult", consent: { contact: true, reminders: true }, name: "Other App" },
				}),
			);
			const out = await a.mut(
				"apiBlacklist:create",
				{ entry: { reason: "r", category: "other", severity: "warn", client: other } },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe("unknown_client");
		});
	});

	describe("update, remove, read", () => {
		it("edits fields, bumps the version, audits once, and a no-op audits nothing", async () => {
			const out = await a.mut("apiBlacklist:update", {
				entry: ref("byClient"),
				expectedVersion: 1,
				patch: { severity: "block_online", reason: "new reason" },
			});
			expect(out).toMatchObject({ changed: true, version: 2 });
			const same = await a.mut(
				"apiBlacklist:update",
				{ entry: ref("byClient"), patch: { severity: "block_online" } },
				{ audit: 0 },
			);
			expect(same.changed).toBe(false);
		});

		it.each([
			["a stale version", { expectedVersion: 1, patch: { name: "x" } }, "stale"],
			["a bad phone", { patch: { phone: "1" } }, "invalid"],
			["an unknown field to clear", { patch: {}, clear: ["reason"] }, "invalid"],
			["an expiry in the past", { patch: { expiresAt: 1 } }, "already_expired"],
			["clearing the only identifier", { patch: {}, clear: ["client"] }, "identifier_required"],
			["taking another entry's phone", { patch: { phone: "0700 000 009" } }, "exists"],
			["a client of no app", { patch: { client: "nope" } }, "unknown_client"],
		])("refuses %s and writes nothing", async (_label, extra, reason) => {
			const out = await a.mut(
				"apiBlacklist:update",
				{ entry: ref("byClient"), ...extra },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe(reason);
		});

		it("a warn-only caller may not touch a stronger entry nor make one stronger", async () => {
			const weak = id(await flag({ phone: "0700 000 012" }));
			for (const [entry, patch] of [
				[ref("byClient"), { name: "x" }],
				[weak, { severity: "block_all" }],
			] as const) {
				const out = await a.mut(
					"apiBlacklist:update",
					{ entry, patch, limit: "warn_only" },
					{ audit: 0, ok: false, same: true },
				);
				expect(out.reason).toBe("severity_not_allowed");
			}
			await a.mut("apiBlacklist:update", {
				entry: weak,
				patch: { reason: "better" },
				limit: "warn_only",
			});
		});

		it("another app's entry is not found", async () => {
			const out = await b.mut(
				"apiBlacklist:update",
				{ entry: ref("byPhone"), patch: { name: "x" } },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe("not_found");
			for (const fn of ["apiBlacklist:remove"]) {
				const gone = await b.mut(
					fn,
					{ entry: ref("byPhone") },
					{ audit: 0, ok: false, same: true },
				);
				expect(gone.reason).toBe("not_found");
			}
			const read = await b.qry("apiBlacklist:get", { entry: ref("byPhone") }, { ok: false });
			expect(read.ok).toBe(false);
		});

		it("switches an entry off and on; listing hides the switched-off one unless asked", async () => {
			const entry = id(await flag({ phone: "0700 000 013" }));
			await a.mut("apiBlacklist:update", { entry, patch: { active: false } });
			const shown = await a.qry("apiBlacklist:list", {});
			expect((shown.entries as Array<{ id: string }>).some((e) => e.id === entry)).toBe(false);
			const all = await a.qry("apiBlacklist:list", { includeInactive: true });
			expect((all.entries as Array<{ id: string }>).some((e) => e.id === entry)).toBe(true);
			// A second active entry for the same phone is refused when switching the first back on.
			await flag({ phone: "0700 000 013" });
			const back = await a.mut(
				"apiBlacklist:update",
				{ entry, patch: { active: true } },
				{ audit: 0, ok: false, same: true },
			);
			expect(back.reason).toBe("exists");
		});

		it("removes an entry, audited once; a second removal is refused", async () => {
			const entry = id(await flag({ phone: "0700 000 014" }));
			await a.mut("apiBlacklist:remove", { entry });
			const again = await a.mut(
				"apiBlacklist:remove",
				{ entry },
				{ audit: 0, ok: false, same: true },
			);
			expect(again.reason).toBe("not_found");
		});

		it("list hides an expired entry and shows it when asked", async () => {
			const entry = id(await flag({ phone: "0700 000 015", expiresAt: Date.now() + 3 * HOUR }));
			const later = Date.now() + 5 * HOUR;
			const shown = await a.qry("apiBlacklist:list", { now: later });
			expect((shown.entries as Array<{ id: string }>).some((e) => e.id === entry)).toBe(false);
			const all = await a.qry("apiBlacklist:list", { now: later, includeInactive: true });
			expect((all.entries as Array<{ id: string }>).some((e) => e.id === entry)).toBe(true);
		});
	});

	describe("check (the staff banner)", () => {
		it("finds the entry by phone in any spelling, by e-mail, and says which matched", async () => {
			const byPhone = await a.qry("apiBlacklist:check", { phone: "+40 (0)700 000 009" });
			expect(byPhone.hit).toMatchObject({
				entry: ref("byPhone"),
				severity: "block_online",
				matchedBy: "phone",
			});
			const byEmail = await a.qry("apiBlacklist:check", { email: "BAD@test.example" });
			expect(byEmail.hit).toMatchObject({ matchedBy: "email", reason: "a reason" });
		});

		it("finds a client by record, and a child through the guardian's phone", async () => {
			const byClient = await a.qry("apiBlacklist:check", { client: ref("ion") });
			expect(byClient.hit).toMatchObject({ entry: ref("byClient"), matchedBy: "client" });
			const guardianFlag = id(await flag({ phone: "0700 000 003", severity: "block_online" }));
			const child = await a.qry("apiBlacklist:check", { client: ref("child") });
			expect(child.hit).toMatchObject({ entry: guardianFlag, matchedBy: "phone" });
		});

		it("is empty for someone unflagged, for a name alone, and in another app", async () => {
			expect((await a.qry("apiBlacklist:check", { phone: "0700 999 999" })).hit).toBeNull();
			expect((await a.qry("apiBlacklist:check", { name: "Test Bad" })).hit).toBeNull();
			expect((await b.qry("apiBlacklist:check", { phone: "0700 000 009" })).hit).toBeNull();
			expect((await a.qry("apiBlacklist:check", { client: "nope" }, { ok: false })).ok).toBe(false);
		});
	});
});
