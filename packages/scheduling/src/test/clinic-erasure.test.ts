import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	buildKeyRing,
	encryptField,
	generateDataKeyBytes,
	generateMasterKeyText,
	type KeyRing,
	parseMasterKey,
	wrapDataKey,
} from "../crypto";
import { backendReady, dumpTable, runMutation, runQuery } from "./admin";

/**
 * Erasing a client for real: the soft-delete's 30 days, the clinic's own job (scoped to this test's
 * app, with the real clock: rows are made old by dating the deletion, never by moving time), what
 * is removed and what the books keep, and that a re-run of the import cannot bring a client back.
 * Synthetic data. Skipped, with a warning, when no backend is up.
 */
if (!backendReady) console.warn("clinic-erasure.test: no local backend or admin key; see README");

const TENANT = `test-erase-${Date.now().toString(36)}`;
const DAY = 86_400_000;
const resultsSchema = z.array(
	z.object({
		legacyId: z.string(),
		id: z.string().optional(),
		outcome: z.string(),
		flag: z.string().optional(),
	}),
);
const at = (c: Record<string, number>, key: string): number => c[key] ?? 0;

describe.skipIf(!backendReady)("erasing a client on the local Convex", () => {
	let ring: KeyRing;
	const ids: Record<string, string> = {};
	const counts = () =>
		runQuery("clinicInspect:counts", { tenant: TENANT }, z.record(z.string(), z.number()));
	const upsert = (fn: string, rows: Array<Record<string, unknown>>) =>
		runMutation(fn, { tenant: TENANT, rows }, resultsSchema);
	const client = (n: number) => ({
		legacyId: `clients:${n}`,
		fingerprint: `fp-client-${n}`,
		name: `Erase Client ${String.fromCharCode(64 + n)}`,
		kind: "adult",
		phone: `0700 000 00${n}`,
		consent: { contact: true, reminders: false },
		status: "active",
		createdAt: 1,
		treatingLegacy: "therapists:1",
	});
	const standing = (clientId: string, action: string, now: number) =>
		runMutation(
			"clinicStanding:change",
			{ tenant: TENANT, client: clientId, action, actor: "sub-test", now },
			z.object({ ok: z.boolean(), reason: z.string().optional() }),
		);
	const job = () =>
		runMutation(
			"clinicRetention:eraseDue",
			{ now: Date.now(), tenant: TENANT },
			z.object({ erased: z.number(), more: z.boolean() }),
		);

	beforeAll(async () => {
		if (!backendReady) return;
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "Test", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.object({ created: z.boolean() }),
		);
		const master = await parseMasterKey(generateMasterKeyText());
		const wrapped = await wrapDataKey(master, generateDataKeyBytes(), TENANT, 1);
		ring = await buildKeyRing(master, TENANT, [wrapped]);
		await runMutation("clinicKeys:install", { tenant: TENANT, version: 1, wrapped }, z.string());
		await upsert("importPeople:upsertPractitioners", [
			{
				legacyId: "therapists:1",
				fingerprint: "p",
				slug: "t-one",
				displayName: "Test Therapist",
				active: true,
			},
		]);
		for (const r of await upsert("importClients:upsertClients", [client(3), client(4)]))
			ids[r.legacyId] = r.id ?? "";
		await upsert("importMoney:upsertPackages", [
			{
				legacyId: "client_subscriptions:3",
				fingerprint: "k3",
				clientLegacy: "clients:3",
				sessionType: "ABA",
				totalSessions: 5,
				bonusSessions: 0,
				priceMinor: 1000,
				createdAt: 1,
			},
		]);
		await upsert("importVisits:upsertVisits", [
			{
				legacyId: "appointments:3",
				fingerprint: "v3",
				column: { kind: "practitioner", legacyId: "therapists:1" },
				clientLegacy: "clients:3",
				durationMinutes: 60,
				sessionType: "ABA",
				status: "confirmed",
				attendance: "attended",
				reminderSent: false,
				clientConfirmed: false,
				createdBy: "legacy:test",
				createdAt: 1,
				start: Date.UTC(2024, 2, 6, 8),
				end: Date.UTC(2024, 2, 6, 9),
				notes: "SENTINEL-ERASE-NOTE",
			},
		]);
		const payload = await encryptField(
			ring,
			JSON.stringify({ parent_feedback: "SENTINEL-RESPONSE" }),
			`${TENANT}|formResponses.payload`,
		);
		await upsert("importRecords:upsertResponses", [
			{
				legacyId: "session_feedback:3",
				fingerprint: "r3",
				definitionKey: "aba-session-report",
				definitionVersion: 1,
				clientLegacy: "clients:3",
				payload,
				createdAt: 1,
				updatedAt: 1,
			},
		]);
		await upsert("importRecords:upsertFiles", [
			{
				legacyId: "client_files:3",
				fingerprint: "f3",
				kind: "client_file",
				clientLegacy: "clients:3",
				fileName: "report.pdf",
				storageKey: `${TENANT}/client_file/client_files-3/aa`,
				sha256: "a".repeat(64),
				sizeBytes: 10,
				contentType: "application/pdf",
				uploadedBy: "legacy:test",
				encryption: { keyVersion: 1, iv: "iv" },
				createdAt: 1,
			},
		]);
	});

	afterAll(async () => {
		if (backendReady)
			await runMutation("seed:dropFixture", { tenant: TENANT }, z.object({ deleted: z.number() }));
	});

	it("leaves a client deleted 29 days ago alone, and erases one deleted 31 days ago with what hangs on them", async () => {
		const now = Date.now();
		expect(await standing(ids["clients:4"] ?? "", "delete", now - 29 * DAY)).toEqual({ ok: true });
		const before = await counts();
		expect(await job()).toEqual({ erased: 0, more: false });
		expect(await counts()).toEqual(before);

		expect(await standing(ids["clients:3"] ?? "", "delete", now - 31 * DAY)).toEqual({ ok: true });
		expect(await job()).toEqual({ erased: 1, more: false });
		const after = await counts();
		expect(at(after, "formResponses")).toBe(at(before, "formResponses") - 1);
		expect(at(after, "files")).toBe(at(before, "files") - 1);
		expect(at(after, "treating")).toBe(at(before, "treating") - 1);
		expect(at(after, "storageOutbox")).toBe(at(before, "storageOutbox") + 1);
		// The books keep what they need, without a person: the client row emptied, the visit and the package stay.
		for (const kept of ["clients", "visits", "packages", "practitioners"]) {
			expect(at(after, kept)).toBe(at(before, kept));
		}
		expect(dumpTable("visits")).not.toContain("SENTINEL-ERASE-NOTE");
		expect(dumpTable("clients")).not.toContain("Erase Client C");
		expect(await job()).toEqual({ erased: 0, more: false });
	});

	it("a re-run of the import does not bring the erased client back, or anything of theirs", async () => {
		const before = await counts();
		// The CLI dumps every app's rows and other tests write meanwhile: count this app's only.
		const lines = () =>
			dumpTable("clients")
				.split("\n")
				.filter((l) => l.includes(`"tenant":"${TENANT}"`)).length;
		const clientsBefore = lines();
		const again = await upsert("importClients:upsertClients", [client(3)]);
		expect(again[0]).toMatchObject({ outcome: "unchanged", flag: "erased" });
		const payload = await encryptField(
			ring,
			JSON.stringify({ parent_feedback: "SENTINEL-RESPONSE" }),
			`${TENANT}|formResponses.payload`,
		);
		const responses = await upsert("importRecords:upsertResponses", [
			{
				legacyId: "session_feedback:9",
				fingerprint: "r9",
				definitionKey: "aba-session-report",
				definitionVersion: 1,
				clientLegacy: "clients:3",
				payload,
				createdAt: 1,
				updatedAt: 1,
			},
		]);
		expect(responses[0]).toMatchObject({ outcome: "orphan", flag: "erased:client" });
		const files = await upsert("importRecords:upsertFiles", [
			{
				legacyId: "client_files:9",
				fingerprint: "f9",
				kind: "client_file",
				clientLegacy: "clients:3",
				fileName: "x.pdf",
				storageKey: `${TENANT}/client_file/client_files-9/bb`,
				sha256: "b".repeat(64),
				sizeBytes: 1,
				contentType: "application/pdf",
				uploadedBy: "legacy:test",
				encryption: { keyVersion: 1, iv: "iv" },
				createdAt: 1,
			},
		]);
		expect(files[0]).toMatchObject({ outcome: "orphan", flag: "erased:client" });
		const visits = await upsert("importVisits:upsertVisits", [
			{
				legacyId: "appointments:9",
				fingerprint: "v9",
				column: { kind: "practitioner", legacyId: "therapists:1" },
				clientLegacy: "clients:3",
				durationMinutes: 60,
				sessionType: "ABA",
				status: "confirmed",
				attendance: "pending",
				reminderSent: false,
				clientConfirmed: false,
				createdBy: "legacy:test",
				createdAt: 1,
				start: Date.UTC(2024, 5, 1, 8),
				end: Date.UTC(2024, 5, 1, 9),
			},
		]);
		expect(visits[0]).toMatchObject({ outcome: "orphan", flag: "erased:client" });
		const packages = await upsert("importMoney:upsertPackages", [
			{
				legacyId: "client_subscriptions:9",
				fingerprint: "k9",
				clientLegacy: "clients:3",
				sessionType: "ABA",
				totalSessions: 1,
				bonusSessions: 0,
				priceMinor: 1,
				createdAt: 1,
			},
		]);
		expect(packages[0]).toMatchObject({ outcome: "orphan", flag: "erased:client" });
		expect(await counts()).toEqual(before);
		expect(lines()).toBe(clientsBefore);
	});

	it("an erased client cannot be restored; one that is only deleted can", async () => {
		expect(await standing(ids["clients:3"] ?? "", "restore", Date.now())).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect(await standing(ids["clients:4"] ?? "", "restore", Date.now())).toEqual({ ok: true });
	});
});
