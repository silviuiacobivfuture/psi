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
import { callQuery } from "./server";

/**
 * Responses that belong to no client, on the real store: the import writes one (no client, its visit and practitioner),
 * a rerun changes nothing, a client that is NAMED but unknown or erased is still refused, the server-keyed reads keep it
 * off every client's list, and a client's erasure removes only that client's responses. Synthetic data, in a throwaway
 * `test-orphan-…` app. Skipped, with a warning, when no backend is up.
 */
if (!backendReady) console.warn("clinic-orphan-responses.test: no local backend; see README");

const TENANT = `test-orphan-${Date.now().toString(36)}`;
const DAY = 86_400_000;
const Results = z.array(
	z.object({
		legacyId: z.string(),
		id: z.string().optional(),
		outcome: z.string(),
		flag: z.string().optional(),
	}),
);
const Stored = z.object({
	id: z.string(),
	client: z.string().optional(),
	visit: z.string().optional(),
	practitioner: z.string().optional(),
	definitionKey: z.string(),
});
const Records = z.object({ ok: z.literal(true), records: z.array(Stored) });
const One = z.object({ ok: z.literal(true), record: Stored });
const Refusal = z.object({ ok: z.literal(false), reason: z.string() });
const at = (c: Record<string, number>, key: string): number => c[key] ?? 0;

describe.skipIf(!backendReady)("responses that belong to no client, on the local Convex", () => {
	let ring: KeyRing;
	const ids: Record<string, string> = {};
	const counts = () =>
		runQuery("clinicInspect:counts", { tenant: TENANT }, z.record(z.string(), z.number()));
	const upsert = (fn: string, rows: Array<Record<string, unknown>>) =>
		runMutation(fn, { tenant: TENANT, rows }, Results);
	const payload = (text: string) =>
		encryptField(
			ring,
			JSON.stringify({ parent_feedback: text }),
			`${TENANT}|formResponses.payload`,
		);
	const response = async (n: number, over: Record<string, unknown>) => ({
		legacyId: `session_feedback:${n}`,
		fingerprint: `r${n}`,
		definitionKey: "aba-session-report",
		definitionVersion: 1,
		payload: await payload(`SENTINEL-ORPHAN-${n}`),
		createdAt: 1,
		updatedAt: 1,
		...over,
	});
	const visit = (n: number, clientLegacy?: string) => ({
		legacyId: `appointments:${n}`,
		fingerprint: `v${n}`,
		column: { kind: "practitioner", legacyId: "therapists:1" },
		...(clientLegacy === undefined ? {} : { clientLegacy }),
		durationMinutes: 60,
		sessionType: "ABA",
		status: "confirmed",
		attendance: "attended",
		reminderSent: false,
		clientConfirmed: false,
		createdBy: "legacy:test",
		createdAt: 1,
		start: Date.UTC(2024, 2, n % 28, 8),
		end: Date.UTC(2024, 2, n % 28, 9),
	});
	const withoutClient = async () =>
		Records.parse(await callQuery("apiRecordsExtra:recordsWithoutClient", { tenant: TENANT }))
			.records;

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
		const people = await upsert("importPeople:upsertPractitioners", [
			{
				legacyId: "therapists:1",
				fingerprint: "p",
				slug: "t-one",
				displayName: "Test Therapist",
				active: true,
			},
		]);
		ids.practitioner = people[0]?.id ?? "";
		const clients = await upsert("importClients:upsertClients", [
			{
				legacyId: "clients:3",
				fingerprint: "c3",
				name: "Orphan Test Client",
				kind: "adult",
				phone: "0700 000 003",
				consent: { contact: true, reminders: false },
				status: "active",
				createdAt: 1,
			},
		]);
		ids.client = clients[0]?.id ?? "";
		// The orphans' visits have no client (it was deleted in the old app); the client's visit has one.
		for (const r of await upsert("importVisits:upsertVisits", [
			visit(890),
			visit(1807),
			visit(3, "clients:3"),
		]))
			ids[r.legacyId] = r.id ?? "";
	});

	afterAll(async () => {
		if (backendReady)
			await runMutation("seed:dropFixture", { tenant: TENANT }, z.object({ deleted: z.number() }));
	});

	it("imports a response of no client on its visit and practitioner, and a client's response with its client", async () => {
		const before = await counts();
		const out = await upsert("importRecords:upsertResponses", [
			await response(36, { visitLegacy: "appointments:890", practitionerLegacy: "therapists:1" }),
			await response(94, {}),
			await response(3, { clientLegacy: "clients:3", visitLegacy: "appointments:3" }),
		]);
		expect(out.map((r) => [r.legacyId, r.outcome])).toEqual([
			["session_feedback:36", "created"],
			["session_feedback:94", "created"],
			["session_feedback:3", "created"],
		]);
		const after = await counts();
		expect(at(after, "formResponses")).toBe(at(before, "formResponses") + 3);
		// Each write is in the change log, the orphans like any other row.
		expect(at(after, "changeLog")).toBe(at(before, "changeLog") + 3);
		ids.orphan = out[0]?.id ?? "";
		ids.bare = out[1]?.id ?? "";
		ids.attached = out[2]?.id ?? "";

		const orphans = await withoutClient();
		expect(orphans.map((r) => r.id).sort()).toEqual([ids.orphan, ids.bare].sort());
		const orphan = orphans.find((r) => r.id === ids.orphan);
		expect(orphan?.client).toBeUndefined();
		expect(orphan?.visit).toBe(ids["appointments:890"]);
		expect(orphan?.practitioner).toBe(ids.practitioner);
		const bare = orphans.find((r) => r.id === ids.bare);
		expect(bare?.visit).toBeUndefined();
		expect(bare?.practitioner).toBeUndefined();
		expect(dumpTable("formResponses")).not.toContain("SENTINEL-ORPHAN");
	});

	it("a rerun of the same rows changes nothing", async () => {
		const before = await counts();
		const out = await upsert("importRecords:upsertResponses", [
			await response(36, { visitLegacy: "appointments:890", practitionerLegacy: "therapists:1" }),
			await response(94, {}),
		]);
		expect(out.map((r) => r.outcome)).toEqual(["unchanged", "unchanged"]);
		expect(await counts()).toEqual(before);
	});

	it("a client that is named but unknown is refused, and nothing is written", async () => {
		const before = await counts();
		const out = await upsert("importRecords:upsertResponses", [
			await response(500, { clientLegacy: "clients:999" }),
		]);
		expect(out[0]).toMatchObject({ outcome: "orphan", flag: "missing:client" });
		expect(await counts()).toEqual(before);
	});

	it("an unknown visit is refused as before (the planner drops a visit it does not know)", async () => {
		const before = await counts();
		const out = await upsert("importRecords:upsertResponses", [
			await response(501, { visitLegacy: "appointments:424242" }),
		]);
		expect(out[0]).toMatchObject({ outcome: "orphan", flag: "missing:visit" });
		expect(await counts()).toEqual(before);
	});

	it("the server-keyed reads keep it off the client's list and show it by id with no client", async () => {
		const ofClient = Records.parse(
			await callQuery("apiRecordsExtra:recordsList", { tenant: TENANT, client: ids.client }),
		).records;
		expect(ofClient.map((r) => r.id)).toEqual([ids.attached]);
		const all = Records.parse(
			await callQuery("apiRecordsExtra:recordsList", { tenant: TENANT }),
		).records;
		expect(all.map((r) => r.id).sort()).toEqual([ids.orphan, ids.bare, ids.attached].sort());
		const one = One.parse(
			await callQuery("apiRecordsExtra:recordById", { tenant: TENANT, record: ids.orphan }),
		);
		expect(one.record.client).toBeUndefined();
		// Another app's key reaches none of it.
		const elsewhere = Records.parse(
			await callQuery("apiRecordsExtra:recordsWithoutClient", { tenant: `${TENANT}-other` }),
		);
		expect(elsewhere.records).toEqual([]);
		expect(
			Refusal.parse(
				await callQuery("apiRecordsExtra:recordById", {
					tenant: `${TENANT}-other`,
					record: ids.orphan,
				}),
			).reason,
		).toBe("not_found");
		await expect(
			callQuery("apiRecordsExtra:recordsWithoutClient", { tenant: TENANT }, "wrong-key"),
		).rejects.toThrow();
	});

	it("the old-app sync's inspection sees it by its old id", async () => {
		const stored = await runQuery(
			"clinicInspect:stored",
			{ tenant: TENANT, table: "formResponses" },
			z.array(z.object({ legacyId: z.string(), fingerprint: z.string().optional() })),
		);
		expect(stored.map((s) => s.legacyId).sort()).toEqual([
			"session_feedback:3",
			"session_feedback:36",
			"session_feedback:94",
		]);
	});

	it("erasing the client removes the client's response only; the responses of no client stay", async () => {
		const standing = await runMutation(
			"clinicStanding:change",
			{
				tenant: TENANT,
				client: ids.client,
				action: "delete",
				actor: "sub-test",
				now: Date.now() - 31 * DAY,
			},
			z.object({ ok: z.boolean() }),
		);
		expect(standing.ok).toBe(true);
		const before = await counts();
		expect(
			await runMutation(
				"clinicRetention:eraseDue",
				{ now: Date.now(), tenant: TENANT },
				z.object({ erased: z.number(), more: z.boolean() }),
			),
		).toEqual({ erased: 1, more: false });
		const after = await counts();
		expect(at(after, "formResponses")).toBe(at(before, "formResponses") - 1);
		expect((await withoutClient()).map((r) => r.id).sort()).toEqual([ids.orphan, ids.bare].sort());
		expect(
			Refusal.parse(
				await callQuery("apiRecordsExtra:recordById", { tenant: TENANT, record: ids.attached }),
			).reason,
		).toBe("not_found");
	});

	it("an erased client's response never comes back, with or without its client", async () => {
		const before = await counts();
		const out = await upsert("importRecords:upsertResponses", [
			await response(3, { clientLegacy: "clients:3", visitLegacy: "appointments:3" }),
		]);
		expect(out[0]).toMatchObject({ outcome: "orphan", flag: "erased:client" });
		expect(await counts()).toEqual(before);
		expect((await withoutClient()).map((r) => r.id).sort()).toEqual([ids.orphan, ids.bare].sort());
	});
});
