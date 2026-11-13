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
 * The clinic's import functions, standing and erasure against the local Convex backend (README):
 * created, updated, unchanged, orphan; encrypted fields never stored in the clear; the web-request
 * retention leaving every clinic table alone; the 30-day soft delete and its erasure job.
 * Synthetic data only. Skipped, with a warning, when no backend is up.
 */
if (!backendReady) console.warn("clinic-backend.test: no local backend or admin key; see README");

const TENANT = `test-clinic-${Date.now().toString(36)}`;
const DAY = 86_400_000;
const SENTINEL = "SENTINEL-DIAGNOSIS-ZXQ";

const resultsSchema = z.array(
	z.object({
		legacyId: z.string(),
		id: z.string().optional(),
		outcome: z.enum(["created", "updated", "unchanged", "orphan"]),
		flag: z.string().optional(),
	}),
);
const countsSchema = z.record(z.string(), z.number());
const at = (c: Record<string, number>, key: string): number => c[key] ?? 0;
const outcomes = (r: z.infer<typeof resultsSchema>) => r.map((x) => x.outcome);

describe.skipIf(!backendReady)("the clinic's rows on the local Convex", () => {
	let ring: KeyRing;
	let practitionerIds: Record<string, string> = {};

	const counts = () => runQuery("clinicInspect:counts", { tenant: TENANT }, countsSchema);
	const upsert = (fn: string, rows: Array<Record<string, unknown>>) =>
		runMutation(fn, { tenant: TENANT, rows }, resultsSchema);

	const client = (n: number, extra: Record<string, unknown> = {}) => ({
		legacyId: `clients:${n}`,
		fingerprint: `fp-client-${n}`,
		name: `Test Client ${String.fromCharCode(64 + n)}`,
		kind: "adult",
		phone: `0700 000 00${n}`,
		consent: { contact: true, reminders: false },
		status: "active",
		createdAt: Date.UTC(2025, 0, n),
		...extra,
	});

	beforeAll(async () => {
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "Test clinic", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.object({ created: z.boolean(), rolesAdded: z.number(), formsAdded: z.number() }),
		);
		const master = await parseMasterKey(generateMasterKeyText());
		const wrapped = await wrapDataKey(master, generateDataKeyBytes(), TENANT, 1);
		ring = await buildKeyRing(master, TENANT, [wrapped]);
		await runMutation("clinicKeys:install", { tenant: TENANT, version: 1, wrapped }, z.string());
	});

	afterAll(async () => {
		if (backendReady) {
			await runMutation("seed:dropFixture", { tenant: TENANT }, z.object({ deleted: z.number() }));
		}
	});

	it("starts an app with its seven roles and four form templates, once", async () => {
		const again = await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "Test clinic", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.object({ created: z.boolean(), rolesAdded: z.number(), formsAdded: z.number() }),
		);
		expect(again).toEqual({ created: false, rolesAdded: 0, formsAdded: 0 });
		const c = await counts();
		expect(at(c, "roles")).toBe(7);
		expect(at(c, "formDefinitions")).toBe(4);
		expect(at(c, "auditEvents")).toBe(2); // app.create and key.install
	});

	it("keeps a wrapped data key per version and never replaces one", async () => {
		const keys = await runQuery(
			"clinicKeys:list",
			{ tenant: TENANT },
			z.array(z.object({ version: z.number() })),
		);
		expect(keys.map((k) => k.version)).toEqual([1]);
		const dumped = dumpTable("appKeys");
		expect(dumped).not.toContain("CLINIC_MASTER_KEY");
		const again = await runMutation(
			"clinicKeys:install",
			{ tenant: TENANT, version: 1, wrapped: { keyVersion: 1, iv: "x", data: "y" } },
			z.string(),
		);
		expect(again).toBe("exists");
	});

	it("imports people, clients, packages, visits, responses and files; then does nothing the second time", async () => {
		const people = await upsert("importPeople:upsertPractitioners", [
			{
				legacyId: "therapists:1",
				fingerprint: "fp-p1",
				slug: "t-one",
				displayName: "Test Therapist One",
				active: true,
			},
			{
				legacyId: "therapists:2",
				fingerprint: "fp-p2",
				slug: "t-two",
				displayName: "Test Therapist Two",
				active: true,
			},
		]);
		expect(outcomes(people)).toEqual(["created", "created"]);
		practitionerIds = Object.fromEntries(people.map((p) => [p.legacyId, p.id ?? ""]));
		await upsert("importPeople:upsertDevices", [
			{
				legacyId: "resource:nfb-1",
				fingerprint: "fp-d1",
				slug: "nfb-1",
				name: "NFB 1",
				kind: "neurofeedback",
				active: true,
			},
		]);
		await upsert("importPeople:upsertGroups", [
			{
				legacyId: "group_activities:10",
				fingerprint: "fp-g10",
				slug: "racemeup",
				name: "RaceMeUp",
				active: true,
			},
		]);
		await upsert("importPeople:upsertStaff", [
			{
				legacyId: "therapists:101",
				fingerprint: "fp-s101",
				name: "Test Reception",
				kind: "reception",
				active: true,
			},
		]);
		const diagnosis = await encryptField(ring, SENTINEL, `${TENANT}|clients.diagnosisEnc`);
		const clients = await upsert("importClients:upsertClients", [
			client(1, { treatingLegacy: "therapists:1", diagnosisEnc: diagnosis }),
			client(2),
			client(3, { treatingLegacy: "therapists:1" }),
			client(4, { treatingLegacy: "therapists:2" }),
		]);
		expect(outcomes(clients)).toEqual(["created", "created", "created", "created"]);
		await upsert("importMoney:upsertPackages", [
			{
				legacyId: "client_subscriptions:1",
				fingerprint: "fp-pk1",
				clientLegacy: "clients:1",
				sessionType: "ABA",
				totalSessions: 10,
				bonusSessions: 1,
				priceMinor: 100_000,
				createdAt: 1,
			},
			{
				legacyId: "client_subscriptions:3",
				fingerprint: "fp-pk3",
				clientLegacy: "clients:3",
				sessionType: "ABA",
				totalSessions: 5,
				bonusSessions: 0,
				priceMinor: 50_000,
				createdAt: 1,
			},
		]);
		await upsert("importMoney:upsertPayments", [
			{
				legacyId: "client_subscriptions:1:paid",
				fingerprint: "fp-pay1",
				clientLegacy: "clients:1",
				packageLegacy: "client_subscriptions:1",
				amountMinor: 40_000,
				at: 1,
			},
		]);
		const notes = await encryptField(
			ring,
			"SENTINEL-THERAPIST-NOTE",
			`${TENANT}|visits.therapistNotes`,
		);
		const visitBase = {
			durationMinutes: 60,
			sessionType: "ABA",
			status: "confirmed",
			attendance: "attended",
			reminderSent: false,
			clientConfirmed: true,
			createdBy: "legacy:test",
			createdAt: 1,
		};
		const visits = await upsert("importVisits:upsertVisits", [
			{
				...visitBase,
				legacyId: "appointments:1",
				fingerprint: "fp-v1",
				column: { kind: "practitioner", legacyId: "therapists:1" },
				clientLegacy: "clients:1",
				packageLegacy: "client_subscriptions:1",
				creditType: "base",
				deviceLegacy: "resource:nfb-1",
				start: Date.UTC(2024, 2, 4, 8),
				end: Date.UTC(2024, 2, 4, 9),
				therapistNotes: notes,
			},
			{
				...visitBase,
				legacyId: "appointments:2",
				fingerprint: "fp-v2",
				column: { kind: "group", legacyId: "group_activities:10" },
				start: Date.UTC(2024, 2, 5, 8),
				end: Date.UTC(2024, 2, 5, 9),
			},
			{
				...visitBase,
				legacyId: "appointments:3",
				fingerprint: "fp-v3",
				column: { kind: "practitioner", legacyId: "therapists:1" },
				clientLegacy: "clients:3",
				start: Date.UTC(2024, 2, 6, 8),
				end: Date.UTC(2024, 2, 6, 9),
				notes: "SENTINEL-VISIT-NOTE",
			},
			{
				...visitBase,
				legacyId: "appointments:4",
				fingerprint: "fp-v4",
				column: { kind: "practitioner", legacyId: "therapists:1" },
				clientLegacy: "clients:999",
				start: Date.UTC(2024, 2, 7, 8),
				end: Date.UTC(2024, 2, 7, 9),
			},
		]);
		expect(outcomes(visits)).toEqual(["created", "created", "created", "orphan"]);
		expect(visits[3]).toMatchObject({ flag: "missing:client" });
		const payload = await encryptField(
			ring,
			JSON.stringify({ parent_feedback: "SENTINEL-RESPONSE" }),
			`${TENANT}|formResponses.payload`,
		);
		await upsert("importRecords:upsertResponses", [
			{
				legacyId: "session_feedback:1",
				fingerprint: "fp-r1",
				definitionKey: "aba-session-report",
				definitionVersion: 1,
				clientLegacy: "clients:1",
				visitLegacy: "appointments:1",
				payload,
				createdAt: 1,
				updatedAt: 1,
			},
			{
				legacyId: "session_feedback:3",
				fingerprint: "fp-r3",
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
				fingerprint: "fp-f3",
				kind: "client_file",
				clientLegacy: "clients:3",
				fileName: "report.pdf",
				storageKey: `${TENANT}/client_file/aa/aa`,
				sha256: "a".repeat(64),
				sizeBytes: 10,
				contentType: "application/pdf",
				uploadedBy: "legacy:test",
				encryption: { keyVersion: 1, iv: "iv" },
				createdAt: 1,
			},
		]);
		await upsert("importRoster:upsertRosterDays", [
			{
				legacyId: "staff_schedule:1",
				fingerprint: "fp-ro1",
				person: { kind: "staff", legacyId: "therapists:101" },
				date: "2026-10-25",
				status: "works",
				startMinutes: 540,
				endMinutes: 1020,
			},
			{
				legacyId: "staff_schedule:2",
				fingerprint: "fp-ro2",
				person: { kind: "practitioner", legacyId: "therapists:77" },
				date: "2026-10-25",
				status: "free",
			},
		]);
		const after = await counts();
		expect(after).toMatchObject({
			practitioners: 2,
			devices: 1,
			groupActivities: 1,
			staffMembers: 1,
			clients: 4,
			treating: 3,
			packages: 2,
			payments: 1,
			visits: 3,
			formResponses: 2,
			files: 1,
			rosterDays: 1,
		});

		// Run the same import again: nothing changes, nothing is audited.
		const reran = await upsert("importVisits:upsertVisits", [
			{
				...visitBase,
				legacyId: "appointments:1",
				fingerprint: "fp-v1",
				column: { kind: "practitioner", legacyId: "therapists:1" },
				clientLegacy: "clients:1",
				packageLegacy: "client_subscriptions:1",
				creditType: "base",
				deviceLegacy: "resource:nfb-1",
				start: Date.UTC(2024, 2, 4, 8),
				end: Date.UTC(2024, 2, 4, 9),
				therapistNotes: notes,
			},
		]);
		expect(outcomes(reran)).toEqual(["unchanged"]);
		const rerunClients = await upsert("importClients:upsertClients", [
			client(1, { treatingLegacy: "therapists:1", diagnosisEnc: diagnosis }),
		]);
		expect(outcomes(rerunClients)).toEqual(["unchanged"]);
		expect(await counts()).toEqual(after);
	});

	it("updates a changed source row once, and flags a practitioner change without making it", async () => {
		const before = await counts();
		const changed = await upsert("importClients:upsertClients", [
			client(1, {
				fingerprint: "fp-client-1b",
				name: "Test Client A Renamed",
				treatingLegacy: "therapists:2",
			}),
		]);
		expect(outcomes(changed)).toEqual(["updated"]);
		expect(changed[0]?.flag).toBe("treating_differs");
		const after = await counts();
		expect({ ...after, auditEvents: 0 }).toEqual({ ...before, auditEvents: 0 });
		expect(at(after, "auditEvents")).toBe(at(before, "auditEvents") + 1);
		const dump = dumpTable("clients");
		expect(dump).toContain("Test Client A Renamed");
		const relation = dumpTable("treating")
			.split("\n")
			.filter((line) => line !== "")
			.map((line) =>
				z
					.object({ tenant: z.string(), legacyId: z.string().optional(), practitioner: z.string() })
					.parse(JSON.parse(line)),
			)
			.find((row) => row.tenant === TENANT && row.legacyId === "clients:1");
		expect(relation?.practitioner).toBe(practitionerIds["therapists:1"]);
	});

	it("stores no clinical text in the clear, anywhere", () => {
		for (const table of ["clients", "visits", "formResponses", "auditEvents"]) {
			const dump = dumpTable(table);
			expect(dump).not.toContain(SENTINEL);
			expect(dump).not.toContain("SENTINEL-THERAPIST-NOTE");
			expect(dump).not.toContain("SENTINEL-RESPONSE");
		}
		// Plain notes are plain by design (the visit's administrative note): this is what is stored.
		expect(dumpTable("visits")).toContain("SENTINEL-VISIT-NOTE");
		expect(dumpTable("auditEvents")).not.toContain("Test Client");
	});

	it("is not touched by the web-request retention, however old the clinic's rows are", async () => {
		// The visits are dated 2024: far older than the booking policy's year. The real job, the real clock.
		const before = await counts();
		let cursor: string | null = null;
		for (let page = 0; page < 100; page += 1) {
			const step: { done: boolean; cursor: string } = await runMutation(
				"retention:purgePage",
				{ now: Date.now(), paginationOpts: { numItems: 200, cursor } },
				z.object({ done: z.boolean(), cursor: z.string() }),
			);
			if (step.done) break;
			cursor = step.cursor;
		}
		expect(await counts()).toEqual(before);
		expect(at(before, "visits")).toBeGreaterThan(0);
	});

	const standing = (client: string, action: string, now?: number) =>
		runMutation(
			"clinicStanding:change",
			{ tenant: TENANT, client, action, actor: "sub-test", ...(now === undefined ? {} : { now }) },
			z.object({ ok: z.boolean(), reason: z.string().optional() }),
		);

	it("archives, deletes softly and restores within 30 days, each change audited; refuses what does not apply", async () => {
		const ids = Object.fromEntries(
			(await upsert("importClients:upsertClients", [client(2), client(3), client(4)])).map((r) => [
				r.legacyId,
				r.id ?? "",
			]),
		);
		const two = ids["clients:2"] ?? "";
		const audit = at(await counts(), "auditEvents");
		expect(await standing(two, "archive")).toEqual({ ok: true });
		expect(await standing(two, "archive")).toEqual({ ok: false, reason: "already_archived" });
		expect(await standing(two, "unarchive")).toEqual({ ok: true });
		expect(await standing(two, "unarchive")).toEqual({ ok: false, reason: "not_archived" });
		expect(at(await counts(), "auditEvents")).toBe(audit + 2);
		const T0 = Date.now();
		expect(await standing(two, "delete", T0)).toEqual({ ok: true });
		expect(await standing(two, "delete", T0)).toEqual({ ok: false, reason: "already_deleted" });
		expect(await standing(two, "restore", T0 + 31 * DAY)).toEqual({
			ok: false,
			reason: "recovery_expired",
		});
		expect(await standing("not-an-id", "archive")).toEqual({ ok: false, reason: "not_found" });
		expect(await standing(two, "restore", T0 + 10 * DAY)).toEqual({ ok: true });
		expect(dumpTable("auditEvents")).toContain("client.restore");
	});
});
