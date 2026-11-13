import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildKeyRing,
	encryptBytes,
	encryptField,
	fingerprint,
	generateDataKeyBytes,
	generateMasterKeyText,
	type KeyRing,
	parseMasterKey,
	wrapDataKey,
} from "../../src/crypto";
import { createDirSource } from "./files";
import { MAPPING, SENTINELS, syntheticExport } from "./fixture";
import { formatReport, type Report } from "./report";
import { runImport } from "./run";
import type { Encryptor } from "./support";

const _run = promisify(execFile);
const TENANT = MAPPING.app;

let ring: KeyRing;
let _enc: Encryptor;
const dry: Encryptor = {
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
	_enc = {
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
const idsOf = (r: Report, c: string) => code(r, c)?.ids ?? [];

describe("the dry run", () => {
	let report: Report;
	beforeAll(async () => {
		report = await runImport({
			...base(),
			exported: syntheticExport(),
			connect: undefined,
		});
	});

	it("counts every table of the export, parsed and to write", () => {
		const get = (t: string) => report.tables.find((x) => x.table === t);
		expect(report.mode).toBe("dry-run");
		expect(get("clients")).toEqual({ table: "clients", source: 7, parsed: 7, planned: 7 });
		expect(get("therapists")).toMatchObject({ source: 9, parsed: 9, planned: 4 });
		expect(get("appointments")).toMatchObject({ source: 17, parsed: 17, planned: 12 });
		expect(get("client_subscriptions")).toMatchObject({ source: 3, planned: 2 });
		expect(get("staff_schedule")).toMatchObject({ source: 8, planned: 4 });
		expect(get("staff_blocks")).toMatchObject({ source: 2, planned: 1 });
		expect(get("session_feedback")).toMatchObject({ source: 1, planned: 1 });
		expect(get("racemeup_feedback")).toMatchObject({ source: 1, planned: 1 });
		expect(get("psychotherapy_feedback")).toMatchObject({ source: 1, planned: 1 });
		expect(get("parent_feedback")).toMatchObject({ source: 1, planned: 1 });
		expect(get("client_files")).toMatchObject({ source: 1, planned: 1 });
		expect(get("avize")).toMatchObject({ source: 1, planned: 1 });
		expect(get("optimo_volunteers")).toMatchObject({ source: 1, planned: 1 });
		expect(report.filesChecked).toBe(2);
	});

	it("reports the practitioner change inside a weekly series, by old id", () => {
		expect(report.stats?.series).toBe(1);
		expect(report.stats?.seriesChanges).toBe(1);
		expect(idsOf(report, "series_practitioner_change")).toEqual(["appointments:112"]);
	});

	it("reports overlaps on the same practitioner, device or room", () => {
		expect(idsOf(report, "overlap:practitioner")).toEqual(["appointments:100~appointments:121"]);
		expect(idsOf(report, "overlap:device")).toEqual([]);
	});

	it("reports package usage mismatches (stored against derived) and orphan references", () => {
		expect(report.stats?.packageMismatches).toEqual([
			{ id: 1, storedBase: 3, derivedBase: 5, storedBonus: 0, derivedBonus: 0 },
		]);
		expect(idsOf(report, "orphan_subscription_client")).toEqual(["client_subscriptions:2"]);
		expect(idsOf(report, "orphan_appointment_client")).toEqual(["appointments:132"]);
		expect(idsOf(report, "orphan_appointment_column")).toEqual(["appointments:131"]);
		expect(idsOf(report, "orphan_client_practitioner")).toEqual(["clients:7"]);
		expect(idsOf(report, "orphan_roster_person")).toEqual(["staff_schedule:5"]);
		expect(idsOf(report, "roster_for_a_device_or_room")).toEqual(["staff_schedule:6"]);
		expect(idsOf(report, "orphan_feedback_appointment")).toEqual(["psychotherapy_feedback:1"]);
		expect(idsOf(report, "orphan_feedback_practitioner")).toEqual(["psychotherapy_feedback:1"]);
	});

	it("counts duplicate client names and flags group-like clients", () => {
		expect(report.stats?.duplicateNameGroups).toBe(1);
		expect(report.stats?.duplicateNameClients).toBe(2);
		expect(idsOf(report, "group_like_client")).toEqual(["clients:4"]);
		expect(idsOf(report, "unknown_client_status")).toEqual(["clients:6"]);
	});

	it("skips what cannot be placed: unknown status, bad date, a time the clocks skip, no column", () => {
		expect(idsOf(report, "unknown_appointment_status")).toEqual(["appointments:133"]);
		expect(idsOf(report, "bad_appointment_date")).toEqual(["appointments:134"]);
		expect(idsOf(report, "appointment_nonexistent")).toEqual(["appointments:135"]);
		expect(idsOf(report, "appointment_without_column")).toEqual(["appointments:138"]);
		expect(idsOf(report, "roster_works_without_valid_hours")).toEqual(["staff_schedule:7"]);
		expect(idsOf(report, "unknown_roster_status")).toEqual(["staff_schedule:8"]);
		expect(idsOf(report, "block_ends_before_start")).toEqual(["staff_blocks:2"]);
		expect(code(report, "unknown_appointment_status")?.severity).toBe("skipped");
	});

	it("notes the smaller things and blocks nothing", () => {
		expect(idsOf(report, "package_visit_without_credit_type")).toEqual(["appointments:139"]);
		expect(idsOf(report, "paid_flag_without_amount")).toEqual(["appointments:139"]);
		expect(report.anomalies.filter((a) => a.severity === "blocking")).toEqual([]);
	});

	it("prints only counts, anomalies and old ids: no name, phone, note or clinical word", () => {
		const text = formatReport(report) + JSON.stringify(report);
		for (const value of Object.values(SENTINELS)) expect(text).not.toContain(value);
		for (const forbidden of [
			"Test Client",
			"Test Therapist",
			"Test Guardian",
			"0700 000",
			"Test notice",
			"Test package note",
			"Test leave",
			"mother",
		]) {
			expect(text).not.toContain(forbidden);
		}
	});
});
