import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation, runQuery } from "./admin";
import { DAY, enc, harness, id } from "./api-harness";

/**
 * `apiNotes`: staff notes about a client, against the local backend in a throwaway `test-notes-…` app (synthetic data).
 * A refusal is its own case and writes NOTHING; a change appends exactly one audit event naming fields, never a word of
 * the note; a clinical note is ciphertext and cannot cross to a plain category, nor the other way.
 */
if (!backendReady) console.warn("api-notes.test: no local backend; see README");

const { TENANT, mut, qry, counts } = harness("notes");
const NOT_THERE = { audit: 0, ok: false, same: true } as const;

describe.skipIf(!backendReady)("notes about a client", () => {
	const ids: Record<string, string> = {};
	const note = (extra: Record<string, unknown> = {}, e = {}) =>
		mut(
			"apiNotes:create",
			{ client: ids.c1, category: "general", text: "a note", pinned: false, ...extra },
			e,
		);
	const held = async (client: string | undefined) =>
		(await qry("apiNotes:list", { client })).notes as Record<string, unknown>[];

	beforeAll(async () => {
		if (!backendReady) return;
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "T", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.unknown(),
		);
		const client = {
			name: "Test Client A",
			kind: "adult",
			consent: { contact: true, reminders: false },
		};
		ids.c1 = id(await mut("apiClients:create", { client }));
		ids.c2 = id(await mut("apiClients:create", { client: { ...client, name: "Test Client B" } }));
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("writes a plain note and a clinical one: the text of the first, the ciphertext of the second, one audit event each", async () => {
		const plain = id(await note());
		const clinic = id(await note({ category: "clinic", text: undefined, textEnc: enc }));
		const rows = await held(ids.c1);
		expect(rows.find((r) => r.id === plain)).toMatchObject({
			category: "general",
			text: "a note",
			author: "sub-test",
			version: 1,
		});
		expect(rows.find((r) => r.id === clinic)).toMatchObject({ category: "clinic", textEnc: enc });
		expect(rows.find((r) => r.id === clinic)?.text).toBeUndefined();
	});

	it.each([
		["a plain note with no text", { text: undefined }],
		["a plain note with a blank text", { text: "   " }],
		["a plain note with ciphertext too", { textEnc: enc }],
		["a plain note over 5000 characters", { text: "x".repeat(5001) }],
		["a clinical note in plain text", { category: "clinic", text: "plain", textEnc: undefined }],
		["a clinical note with neither", { category: "clinic", text: undefined, textEnc: undefined }],
	])("refuses %s, and writes nothing", async (_what, extra) => {
		expect(await note(extra, NOT_THERE)).toMatchObject({ reason: "invalid" });
	});

	it("refuses a client that is not there, and writes nothing", async () => {
		expect(await note({ client: "nope" }, NOT_THERE)).toMatchObject({ reason: "unknown_client" });
		expect(await qry("apiNotes:list", { client: "nope" }, NOT_THERE)).toMatchObject({
			reason: "not_found",
		});
	});

	it("changes a note: only what changed is named, a change that changes nothing writes nothing", async () => {
		const n = id(await note({ text: "first" }));
		await mut("apiNotes:update", { note: n, patch: { text: "second", pinned: true } });
		expect((await held(ids.c1)).find((r) => r.id === n)).toMatchObject({
			text: "second",
			pinned: true,
			version: 2,
		});
		await mut(
			"apiNotes:update",
			{ note: n, patch: { text: "second", pinned: true } },
			{ audit: 0, same: true },
		);
		await mut("apiNotes:update", { note: n, patch: { category: "plata" } });
	});

	it("keeps a note on its side of the clinical line, and refuses what does not fit its category, whole", async () => {
		const plain = id(await note());
		const clinic = id(await note({ category: "clinic", text: undefined, textEnc: enc }));
		expect(
			await mut("apiNotes:update", { note: plain, patch: { category: "clinic" } }, NOT_THERE),
		).toMatchObject({ reason: "invalid" });
		expect(
			await mut("apiNotes:update", { note: clinic, patch: { category: "general" } }, NOT_THERE),
		).toMatchObject({ reason: "invalid" });
		expect(
			await mut("apiNotes:update", { note: clinic, patch: { text: "plain" } }, NOT_THERE),
		).toMatchObject({ reason: "invalid" });
		expect(
			await mut("apiNotes:update", { note: plain, patch: { textEnc: enc } }, NOT_THERE),
		).toMatchObject({ reason: "invalid" });
	});

	it("refuses a note that is not there, from another version, or another app's, and writes nothing", async () => {
		const n = id(await note());
		expect(
			await mut("apiNotes:update", { note: "nope", patch: { pinned: true } }, NOT_THERE),
		).toMatchObject({ reason: "not_found" });
		expect(
			await mut(
				"apiNotes:update",
				{ note: n, expectedVersion: 9, patch: { pinned: true } },
				NOT_THERE,
			),
		).toMatchObject({ reason: "stale" });
		expect(await mut("apiNotes:remove", { note: "nope" }, NOT_THERE)).toMatchObject({
			reason: "not_found",
		});
	});

	it("deletes a note for good, with one audit event", async () => {
		const n = id(await note());
		await mut("apiNotes:remove", { note: n });
		expect((await held(ids.c1)).some((r) => r.id === n)).toBe(false);
		expect(await mut("apiNotes:remove", { note: n }, NOT_THERE)).toMatchObject({
			reason: "not_found",
		});
	});

	it("goes with the client when the client is erased", async () => {
		const gone = id(
			await mut("apiClients:create", {
				client: {
					name: "Test Erased",
					kind: "adult",
					consent: { contact: true, reminders: false },
				},
			}),
		);
		await note({ client: gone, text: "to be erased" });
		await note({ client: gone, category: "clinic", text: undefined, textEnc: enc });
		const before = (await counts()).clientNotes ?? 0;
		expect(before).toBeGreaterThanOrEqual(2);
		const now = Date.now();
		await runMutation(
			"clinicStanding:change",
			{ tenant: TENANT, client: gone, action: "delete", actor: "sub-test", now: now - 31 * DAY },
			z.unknown(),
		);
		await runMutation("clinicRetention:eraseDue", { now, tenant: TENANT }, z.unknown());
		expect((await counts()).clientNotes ?? 0).toBe(before - 2);
		const left = await runQuery(
			"clinicInspect:counts",
			{ tenant: TENANT },
			z.record(z.string(), z.number()),
		);
		expect(left.clientNotes).toBe(before - 2);
	});
});
