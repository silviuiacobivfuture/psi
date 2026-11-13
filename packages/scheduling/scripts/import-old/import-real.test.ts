import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildKeyRing,
	decryptBytes,
	decryptField,
	encryptBytes,
	encryptField,
	fingerprint,
	generateDataKeyBytes,
	generateMasterKeyText,
	type KeyRing,
	parseMasterKey,
	sha256Hex,
	wrapDataKey,
} from "../../src/crypto";
import { MemoryStorage } from "../../src/storage";
import { createDirSource } from "./files";
import { cloneExport, MAPPING, SENTINELS, syntheticExport } from "./fixture";
import { MemorySink } from "./memory-sink";
import type { Report } from "./report";
import { runImport } from "./run";
import type { Encryptor } from "./support";

const _run = promisify(execFile);
const TENANT = MAPPING.app;

let ring: KeyRing;
let enc: Encryptor;
const _dry: Encryptor = {
	encrypt: async () => ({ keyVersion: 1, iv: "dry", data: "dry" }),
	fingerprint: async () => "dry",
	encryptBytes: async (bytes) => ({ keyVersion: 1, iv: "dry", bytes }),
};

let filesDir = "";

beforeAll(async () => {
	const master = await parseMasterKey(generateMasterKeyText());
	ring = await buildKeyRing(master, TENANT, [
		await wrapDataKey(master, generateDataKeyBytes(), TENANT, 1),
	]);
	enc = {
		encrypt: (plain, field) => encryptField(ring, plain, `${TENANT}|${field}`),
		fingerprint: (message) => fingerprint(ring, message),
		encryptBytes: (bytes, context) => encryptBytes(ring, bytes, `${TENANT}|${context}`),
	};
	filesDir = mkdtempSync(join(tmpdir(), "import-old-files-"));
	mkdirSync(join(filesDir, "client-files", "1"), { recursive: true });
	mkdirSync(join(filesDir, "avize"), { recursive: true });
	writeFileSync(join(filesDir, "client-files", "1", "report.pdf"), SENTINELS.fileBytes);
	writeFileSync(join(filesDir, "avize", "notice.txt"), SENTINELS.fileBytes);
});

afterAll(() => rmSync(filesDir, { recursive: true, force: true }));

const base = () => ({
	mapping: MAPPING,
	ignoreTables: [] as string[],
	allowSkips: true,
	files: createDirSource(filesDir),
});

const code = (r: Report, c: string) => r.anomalies.find((a) => a.code === c);
const _idsOf = (r: Report, c: string) => code(r, c)?.ids ?? [];

describe("the real run (against the store's own contract)", () => {
	const real = (exported: unknown, sink: MemorySink, storage = new MemoryStorage(), over = {}) =>
		runImport({ ...base(), exported, connect: async () => ({ sink, enc, storage }), ...over });

	it("writes every table in dependency order, with the right instants", async () => {
		const sink = new MemorySink();
		const report = await real(syntheticExport(), sink);
		expect(report.refusal).toBeUndefined();
		const written = Object.fromEntries(report.written.map((w) => [w.kind, w]));
		expect(written.practitioners).toMatchObject({ created: 4, orphan: 0 });
		expect(written.devices).toMatchObject({ created: 2 });
		expect(written.rooms).toMatchObject({ created: 2 });
		expect(written.groups).toMatchObject({ created: 2 });
		expect(written.staff).toMatchObject({ created: 3 });
		expect(written.clients).toMatchObject({ created: 7 });
		expect(written.packages).toMatchObject({ created: 2 });
		expect(written.payments).toMatchObject({ created: 1 });
		expect(written.visits).toMatchObject({ orphan: 0 });
		expect(sink.count("visits")).toBe(12);
		expect(written.roster).toMatchObject({ created: 4 });
		expect(written.blocks).toMatchObject({ created: 1 });
		expect(written.responses).toMatchObject({ created: 4 });
		expect(written.files).toMatchObject({ created: 2 });
		// The repeated hour of 2026-10-25 takes the earlier instant: 03:30 Bucharest is 00:30 UTC.
		const dst = sink.row("visits", "appointments:100");
		expect(dst).toMatchObject({
			start: Date.UTC(2026, 9, 25, 0, 30),
			end: Date.UTC(2026, 9, 25, 1, 30),
		});
		expect(sink.row("visits", "appointments:120")).toMatchObject({
			start: Date.UTC(2026, 9, 25, 2, 0),
		});
	});

	it("maps columns, resources, statuses and money", async () => {
		const sink = new MemorySink();
		await real(syntheticExport(), sink);
		expect(sink.row("visits", "appointments:100")).toMatchObject({
			column: { kind: "practitioner", legacyId: "therapists:1" },
			clientLegacy: "clients:1",
			roomLegacy: "resource:cabinet-1",
			deviceLegacy: "resource:nfb-1",
			packageLegacy: "client_subscriptions:1",
			creditType: "base",
			attendance: "attended",
			priceMinor: 15_000,
			amountPaidMinor: 15_000,
			paymentMethod: "cash",
			status: "confirmed",
			sessionType: "ABA",
		});
		expect(sink.row("visits", "appointments:120")).toMatchObject({
			column: { kind: "device", legacyId: "resource:nfb-1" },
		});
		expect(sink.row("visits", "appointments:130")).toMatchObject({
			column: { kind: "group", legacyId: "group_activities:10" },
		});
		expect(
			Reflect.get(sink.row("visits", "appointments:130") ?? {}, "clientLegacy"),
		).toBeUndefined();
		expect(
			Reflect.get(sink.row("visits", "appointments:132") ?? {}, "clientLegacy"),
		).toBeUndefined();
		expect(sink.row("visits", "appointments:136")).toMatchObject({
			status: "cancelled",
			attendance: "pending",
		});
		expect(sink.row("visits", "appointments:137")).toMatchObject({ durationMinutes: 45 });
		expect(sink.row("visits", "appointments:139")).toMatchObject({
			paymentMethod: "transfer",
			attendance: "absent",
			reminderSent: true,
			priceMinor: 20_050,
			amountPaidMinor: 20_050,
		});
		expect(sink.row("clients", "clients:1")).toMatchObject({
			kind: "child",
			status: "active",
			treatingLegacy: "therapists:1",
			guardian: { name: "Test Guardian", relationship: "mother" },
		});
		expect(sink.row("clients", "clients:2")).toMatchObject({
			status: "finished",
			archivedAt: Date.parse("2026-09-01T10:00:00Z"),
		});
		expect(sink.row("clients", "clients:3")).toMatchObject({ status: "paused", kind: "adult" });
		expect(sink.row("clients", "clients:6")).toMatchObject({ status: "active" });
		expect(sink.row("packages", "client_subscriptions:1")).toMatchObject({
			priceMinor: 150_050,
			totalSessions: 10,
			bonusSessions: 2,
		});
		expect(sink.row("payments", "client_subscriptions:1:paid")).toMatchObject({
			amountMinor: 50_000,
			packageLegacy: "client_subscriptions:1",
		});
		expect(sink.row("roster", "staff_schedule:3")).toMatchObject({
			status: "medical_leave",
			person: { kind: "practitioner" },
		});
		expect(sink.row("roster", "staff_schedule:2")).toMatchObject({
			status: "annual_leave",
			person: { kind: "staff", legacyId: "therapists:101" },
		});
		expect(sink.row("practitioners", "therapists:4")).toMatchObject({ slug: "t1-4" });
		expect(sink.row("practitioners", "therapists:2")).toMatchObject({
			active: false,
			workDays: [1, 3, 5],
		});
	});

	it("keeps clinical text out of every plain column: encrypted, and decryptable only with the key", async () => {
		const sink = new MemorySink();
		await real(syntheticExport(), sink);
		const dump = sink.dump();
		for (const secret of [
			SENTINELS.diagnosis,
			SENTINELS.notes,
			SENTINELS.reason,
			SENTINELS.therapistNote,
			SENTINELS.feedback,
		]) {
			expect(dump).not.toContain(secret);
		}
		// Plain by design: the visit's administrative note and the client's name and phone.
		expect(dump).toContain(SENTINELS.visitNote);
		const client = sink.row("clients", "clients:1");
		const diagnosis = client !== undefined ? Reflect.get(client, "diagnosisEnc") : undefined;
		expect(await decryptField(ring, diagnosis, `${TENANT}|clients.diagnosisEnc`)).toBe(
			SENTINELS.diagnosis,
		);
	});

	it("stores responses on the seeded templates with the aliased and coerced values", async () => {
		const sink = new MemorySink();
		await real(syntheticExport(), sink);
		const aba = sink.row("responses", "session_feedback:1");
		expect(aba).toMatchObject({
			definitionKey: "aba-session-report",
			definitionVersion: 1,
			clientLegacy: "clients:1",
			visitLegacy: "appointments:100",
			practitionerLegacy: "therapists:1",
		});
		const payload = JSON.parse(
			await decryptField(
				ring,
				Reflect.get(aba ?? {}, "payload"),
				`${TENANT}|formResponses.payload`,
			),
		);
		expect(payload).toEqual({
			programs: ["Test program A", "Test program B"],
			reward_quality: "good",
			intervention_efficiency: 4,
			parent_feedback: SENTINELS.feedback,
			behaviours: ["Test behaviour"],
		});
		const rmu = sink.row("responses", "racemeup_feedback:1");
		expect(
			JSON.parse(
				await decryptField(
					ring,
					Reflect.get(rmu ?? {}, "payload"),
					`${TENANT}|formResponses.payload`,
				),
			),
		).toEqual({ posts: ["p1", "p2"] });
		const psy = sink.row("responses", "psychotherapy_feedback:1");
		expect(Reflect.get(psy ?? {}, "visitLegacy")).toBeUndefined();
		expect(
			JSON.parse(
				await decryptField(
					ring,
					Reflect.get(psy ?? {}, "payload"),
					`${TENANT}|formResponses.payload`,
				),
			),
		).toEqual({ session_number: 5, duration_min: 50, next_session_date: "2026-11-01" });
		const parent = sink.row("responses", "parent_feedback:1");
		expect(
			JSON.parse(
				await decryptField(
					ring,
					Reflect.get(parent ?? {}, "payload"),
					`${TENANT}|formResponses.payload`,
				),
			),
		).toEqual({ reception_rating: 5, would_recommend: "yes" });
	});

	it("is idempotent: a second run creates, updates and writes nothing", async () => {
		const sink = new MemorySink();
		const storage = new MemoryStorage();
		await real(syntheticExport(), sink, storage);
		const changesAfterFirst = sink.changes;
		const objects = new Map(storage.objects);
		const second = await real(syntheticExport(), sink, storage);
		expect(sink.changes).toBe(changesAfterFirst);
		for (const w of second.written)
			expect({ ...w, kind: "" }).toEqual({
				kind: "",
				created: 0,
				updated: 0,
				unchanged: w.unchanged,
				orphan: 0,
			});
		expect(sink.version("visits", "appointments:100")).toBe(1);
		expect(sink.version("clients", "clients:1")).toBe(1);
		// The files were not encrypted and uploaded again (their IV would no longer match the row).
		expect([...storage.objects].map(([k, o]) => [k, o.bytes])).toEqual(
			[...objects].map(([k, o]) => [k, o.bytes]),
		);
	});

	it("updates exactly the rows whose source changed, and bumps their version once", async () => {
		const sink = new MemorySink();
		await real(syntheticExport(), sink);
		const changed = cloneExport();
		const table = changed.tables.appointments;
		const target = table?.find((r) => Reflect.get(r as object, "id") === 100);
		if (target === undefined) throw new Error("fixture");
		Reflect.set(target as object, "price", 175);
		const clients = changed.tables.clients;
		const first = clients?.find((r) => Reflect.get(r as object, "id") === 1);
		if (first === undefined) throw new Error("fixture");
		Reflect.set(first as object, "child_diagnosis", "SENTINEL-DIAGNOSIS-CHANGED");
		const report = await real(changed, sink);
		const w = Object.fromEntries(report.written.map((x) => [x.kind, x]));
		expect(w.visits).toMatchObject({ updated: 1, created: 0 });
		expect(w.clients).toMatchObject({ updated: 1, created: 0 });
		expect(w.practitioners).toMatchObject({ updated: 0 });
		expect(sink.version("visits", "appointments:100")).toBe(2);
		expect(sink.row("visits", "appointments:100")).toMatchObject({ priceMinor: 17_500 });
		expect(sink.version("visits", "appointments:110")).toBe(1);
	});

	it("a change of the mapping changes what depends on it (and only that is rewritten)", async () => {
		const sink = new MemorySink();
		await real(syntheticExport(), sink);
		const second = await runImport({
			...base(),
			mapping: {
				...MAPPING,
				staff: [...MAPPING.staff, { legacyId: 103, name: "Test Third", kind: "other" }],
			},
			exported: syntheticExport(),
			connect: async () => ({ sink, enc, storage: new MemoryStorage() }),
		});
		expect(second.written.find((w) => w.kind === "staff")).toMatchObject({ created: 1 });
		expect(second.written.find((w) => w.kind === "visits")?.updated).toBe(12);
	});

	it("never deletes: rows missing from a later export stay", async () => {
		const sink = new MemorySink();
		await real(syntheticExport(), sink);
		const smaller = cloneExport();
		smaller.tables.appointments = [];
		smaller.tables.session_feedback = [];
		await real(smaller, sink);
		expect(sink.count("visits")).toBe(12);
		expect(sink.count("responses")).toBe(4);
	});

	it("uploads files encrypted: the store sees no plaintext, the row keeps the original's hash and size", async () => {
		const sink = new MemorySink();
		const storage = new MemoryStorage();
		await real(syntheticExport(), sink, storage);
		expect(storage.objects.size).toBe(2);
		const sha = await sha256Hex(new TextEncoder().encode(SENTINELS.fileBytes));
		const row = sink.row("files", "client_files:1");
		expect(row).toMatchObject({
			kind: "client_file",
			sha256: sha,
			sizeBytes: SENTINELS.fileBytes.length,
			clientLegacy: "clients:1",
			contentType: "application/pdf",
			fileName: "report.pdf",
		});
		const key = String(Reflect.get(row ?? {}, "storageKey"));
		expect(key).toBe(`${TENANT}/client_file/client_files-1/${sha}`);
		const stored = storage.objects.get(key);
		expect(new TextDecoder().decode(stored?.bytes)).not.toContain(SENTINELS.fileBytes);
		const meta = Reflect.get(row ?? {}, "encryption");
		const opened = await decryptBytes(
			ring,
			{ keyVersion: meta.keyVersion, iv: meta.iv, bytes: stored?.bytes ?? new Uint8Array() },
			`${TENANT}|files|${key}`,
		);
		expect(new TextDecoder().decode(opened)).toBe(SENTINELS.fileBytes);
		expect(sink.row("files", "avize:1")).toMatchObject({ kind: "notice", title: "Test notice" });
	});
});
