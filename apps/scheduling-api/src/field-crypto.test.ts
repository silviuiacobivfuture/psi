import {
	buildKeyRing,
	CryptoError,
	decryptField,
	encryptField,
	generateDataKeyBytes,
	type KeyRing,
	parseMasterKey,
	wrapDataKey,
} from "@psi/scheduling/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createFieldCrypto, encryptedOf, FIELDS, sealedOf } from "./ports/crypto";
import { createWorld, ok, type Populated } from "./testing/populate";
import { MASTER_KEY } from "./testing/world";

const A = "/v1/apps/psizone";
const WRONG_MASTER = "cd".repeat(32);

/** What the import writes with: the package's own calls, on the same master key and the same stored data keys. */
async function importerRing(w: Populated): Promise<KeyRing> {
	const master = await parseMasterKey(MASTER_KEY);
	if ((await w.store.keys.keys("psizone")).length === 0)
		await w.store.keys.install(
			"psizone",
			1,
			await wrapDataKey(master, generateDataKeyBytes(), "psizone", 1),
		);
	return buildKeyRing(master, "psizone", await w.store.keys.keys("psizone"));
}
const sealedByImport = async (w: Populated, field: string, plain: string): Promise<string> =>
	sealedOf(await encryptField(await importerRing(w), plain, `psizone|${field}`));
const openedByImport = async (w: Populated, field: string, sealed: string): Promise<string> =>
	decryptField(await importerRing(w), encryptedOf(sealed), `psizone|${field}`);

describe("clinical text has one envelope: the package's, for the import and the service alike", () => {
	let w: Populated;
	beforeAll(async () => {
		w = await createWorld();
	});

	it("a record sealed by the import path opens through the service", async () => {
		const sealed = await sealedByImport(
			w,
			"formResponses.payload",
			JSON.stringify({ summary: "synthetic-imported-summary" }),
		);
		const row = await w.store.c.records.get("psizone", w.ids.record);
		if (row === undefined) throw new Error("the populated clinic has a record");
		await w.store.c.records.replace({ ...row, sealed });
		const read = ok(await w.call("olga", "GET", `${A}/records/${w.ids.record}`), "record");
		expect(read.data).toEqual({ summary: "synthetic-imported-summary" });
		const listed = ok(await w.call("olga", "GET", `${A}/clients/${w.ids.c1}/records`), "list");
		expect(JSON.stringify(listed)).toContain("synthetic-imported-summary");
	});

	it("a record written through the service opens through the import path", async () => {
		const made = ok(
			await w.call("olga", "POST", `${A}/clients/${w.ids.c2}/records`, {
				formId: "session-report",
				data: { summary: "synthetic-written-summary" },
			}),
			"record",
		);
		const row = await w.store.c.records.get("psizone", String(made.id));
		expect(JSON.stringify(row)).not.toContain("synthetic-written-summary");
		expect(JSON.parse(await openedByImport(w, "formResponses.payload", row?.sealed ?? ""))).toEqual(
			{
				summary: "synthetic-written-summary",
			},
		);
	});

	it("a client's clinical group written through the service opens through the import path", async () => {
		ok(
			await w.call("olga", "PATCH", `${A}/clients/${w.ids.c1}`, {
				clinical: { diagnosis: "synthetic-diagnosis" },
			}),
			"clinical",
		);
		const row = await w.store.c.clients.get("psizone", w.ids.c1);
		expect(row?.clinicalSealed).toBeDefined();
		expect(await openedByImport(w, "clients.clinical", row?.clinicalSealed ?? "")).toContain(
			"synthetic-diagnosis",
		);
		const read = ok(await w.call("olga", "GET", `${A}/clients/${w.ids.c1}`), "client");
		expect(JSON.stringify(read)).toContain("synthetic-diagnosis");
	});

	it("the client note and the therapist note the import seals open through the service, in their own field only", async () => {
		const note = await sealedByImport(w, "clients.note", "synthetic-client-note");
		const therapist = await sealedByImport(w, "visits.therapistNotes", "synthetic-therapist-note");
		expect(await w.deps.crypto.open("psizone", "clients.note", note)).toBe("synthetic-client-note");
		expect(await w.deps.crypto.open("psizone", "visits.therapistNotes", therapist)).toBe(
			"synthetic-therapist-note",
		);
		// What is sealed for one field, or one app, never opens as another.
		await expect(
			w.deps.crypto.open("psizone", "visits.therapistNotes", note),
		).rejects.toMatchObject({
			code: "decrypt_failed",
		});
		await expect(w.deps.crypto.open("hemisync", "clients.note", note)).rejects.toMatchObject({
			code: "no_keys",
		});
	});

	it("seals with a fresh IV each time and holds no plain text", async () => {
		const a = await w.deps.crypto.seal("psizone", FIELDS.record, "synthetic-same");
		const b = await w.deps.crypto.seal("psizone", FIELDS.record, "synthetic-same");
		expect(a).not.toBe(b);
		expect(a).not.toContain("synthetic");
		expect(encryptedOf(a).keyVersion).toBe(1);
	});

	it("an app with no data key gets one on its first seal, and not before", async () => {
		const crypto = createFieldCrypto(MASTER_KEY, w.store.keys);
		expect(await w.store.keys.keys("clinic-two")).toEqual([]);
		await expect(crypto.open("clinic-two", FIELDS.record, "1.AAAA.AAAA")).rejects.toMatchObject({
			code: "no_keys",
		});
		expect(await w.store.keys.keys("clinic-two")).toEqual([]);
		const sealed = await crypto.seal("clinic-two", FIELDS.record, "synthetic-first");
		expect((await w.store.keys.keys("clinic-two")).length).toBe(1);
		expect(await crypto.open("clinic-two", FIELDS.record, sealed)).toBe("synthetic-first");
	});

	describe("fails closed, naming the cause and never the text", () => {
		const sealedFor = (plain: string) => w.deps.crypto.seal("psizone", FIELDS.record, plain);

		it("with the wrong master key", async () => {
			const sealed = await sealedFor("synthetic-secret");
			const wrong = createFieldCrypto(WRONG_MASTER, w.store.keys);
			await expect(wrong.open("psizone", FIELDS.record, sealed)).rejects.toBeInstanceOf(
				CryptoError,
			);
			await expect(wrong.open("psizone", FIELDS.record, sealed)).rejects.toMatchObject({
				code: "decrypt_failed",
			});
			await expect(wrong.seal("psizone", FIELDS.record, "x")).rejects.toMatchObject({
				code: "decrypt_failed",
			});
		});

		it("with a damaged value, a key version the app does not hold, or something that was never sealed", async () => {
			const sealed = await sealedFor("synthetic-secret");
			const enc = encryptedOf(sealed);
			await expect(
				w.deps.crypto.open(
					"psizone",
					FIELDS.record,
					sealedOf({ ...enc, data: `${enc.data.slice(0, -4)}AAAA` }),
				),
			).rejects.toMatchObject({ code: "decrypt_failed" });
			await expect(
				w.deps.crypto.open("psizone", FIELDS.record, sealedOf({ ...enc, keyVersion: 9 })),
			).rejects.toMatchObject({ code: "unknown_key_version" });
			await expect(
				w.deps.crypto.open("psizone", FIELDS.record, "plain text"),
			).rejects.toMatchObject({ code: "bad_envelope" });
		});

		it("answers a request 500 with the cause class, logs it, and returns no text", async () => {
			const row = await w.store.c.records.get("psizone", w.ids.record);
			if (row === undefined) throw new Error("the populated clinic has a record");
			const held = w.deps.crypto;
			const deps = w.deps as { crypto: typeof held };
			deps.crypto = createFieldCrypto(WRONG_MASTER, w.store.keys);
			try {
				const before = w.logs.length;
				const reply = await w.call("olga", "GET", `${A}/records/${w.ids.record}`);
				expect(reply.status).toBe(500);
				expect(JSON.stringify(reply.json)).toContain("decrypt_failed");
				expect(JSON.stringify(reply.json)).not.toContain("synthetic");
				const event = w.logs.slice(before).find((l) => l.event === "crypto_failed");
				expect(event).toMatchObject({ level: "error", code: "decrypt_failed" });
				expect(JSON.stringify(event)).not.toContain("synthetic");
			} finally {
				deps.crypto = held;
			}
		});
	});
});
