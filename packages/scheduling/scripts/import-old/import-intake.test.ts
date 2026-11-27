import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildKeyRing,
	decryptField,
	encryptBytes,
	encryptField,
	fingerprint,
	generateDataKeyBytes,
	generateMasterKeyText,
	type KeyRing,
	parseMasterKey,
	wrapDataKey,
} from "../../src/crypto";
import { MemoryStorage } from "../../src/storage";
import { createDirSource } from "./files";
import { cloneExport, MAPPING, SENTINELS } from "./fixture";
import { MemorySink } from "./memory-sink";
import { ORPHAN_KEPT } from "./records";
import type { Report } from "./report";
import { runImport } from "./run";
import type { Encryptor } from "./support";

/**
 * The old app's `psychotherapy_intake` table, imported onto the psychotherapy intake template (2026-11-27). Until
 * then it was a table that had to be empty, and the one intake entered on 17 Nov refused every sync for ten days.
 * Named cases: it parses and plans (presence), it is written with every column and its client (functionality), a
 * re-run writes nothing and an edit updates in place (idempotency), and each way it can still refuse writes nothing
 * (side effects) — as do the tables that must stay empty.
 */
const TENANT = MAPPING.app;
const T = "2026-11-17T13:40:00Z";
const INTAKE_TEXT = "SENTINEL-INTAKE-GOALS";

let ring: KeyRing;
let enc: Encryptor;
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
	filesDir = mkdtempSync(join(tmpdir(), "import-intake-files-"));
	mkdirSync(join(filesDir, "client-files", "1"), { recursive: true });
	mkdirSync(join(filesDir, "avize"), { recursive: true });
	writeFileSync(join(filesDir, "client-files", "1", "report.pdf"), SENTINELS.fileBytes);
	writeFileSync(join(filesDir, "avize", "notice.txt"), SENTINELS.fileBytes);
});

afterAll(() => rmSync(filesDir, { recursive: true, force: true }));

/** An intake in the old app's own shape: every column, blanks as empty strings (as the live row has them). */
function intake(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 1,
		client_id: 1,
		created_at: T,
		updated_at: T,
		client_code: "",
		age: "",
		category: "",
		contact: "",
		legal_rep: "",
		referral: "",
		therapist_name: "",
		first_session_date: null,
		presenting_problem: "",
		personal_family_history: "",
		medical_psychiatric_history: "",
		trauma_history: "",
		previous_therapy: "",
		risk_factors: "",
		therapeutic_goals: INTAKE_TEXT,
		...over,
	};
}

function exportWith(rows: ReadonlyArray<Record<string, unknown>>) {
	const e = cloneExport();
	e.tables.psychotherapy_intake = [...rows];
	return e;
}

const run = (exported: unknown, sink: MemorySink | undefined) =>
	runImport({
		exported,
		mapping: MAPPING,
		ignoreTables: [],
		allowSkips: true,
		files: createDirSource(filesDir),
		connect:
			sink === undefined ? undefined : async () => ({ sink, enc, storage: new MemoryStorage() }),
	});

const intakeCount = (r: Report) => r.tables.find((t) => t.table === "psychotherapy_intake");
const responses = (r: Report) => r.written.find((w) => w.kind === "responses");
const blocking = (r: Report) => r.anomalies.filter((a) => a.severity === "blocking");
const payloadOf = async (sink: MemorySink, legacyId: string): Promise<unknown> =>
	JSON.parse(
		await decryptField(
			ring,
			Reflect.get(sink.row("responses", legacyId) ?? {}, "payload"),
			`${TENANT}|formResponses.payload`,
		),
	);

describe("presence: the intake table is mapped", () => {
	it("a dry run parses and plans every intake, with no blocking anomaly", async () => {
		const report = await run(exportWith([intake(), intake({ id: 2, client_id: 3 })]), undefined);
		expect(intakeCount(report)).toEqual({
			table: "psychotherapy_intake",
			source: 2,
			parsed: 2,
			planned: 2,
		});
		expect(blocking(report)).toEqual([]);
		expect(report.anomalies.some((a) => a.code.startsWith("table_must_be_empty"))).toBe(false);
	});

	it("an empty intake table plans nothing and blocks nothing", async () => {
		const report = await run(exportWith([]), undefined);
		expect(intakeCount(report)).toEqual({
			table: "psychotherapy_intake",
			source: 0,
			parsed: 0,
			planned: 0,
		});
		expect(blocking(report)).toEqual([]);
	});
});

describe("functionality: what is written", () => {
	it("writes the intake on the intake template, on its client, every non-blank column, encrypted", async () => {
		const sink = new MemorySink();
		const report = await run(
			exportWith([
				intake({
					age: "34",
					category: "adult",
					first_session_date: "2026-11-20",
					presenting_problem: "Anxietate — ședință inițială",
				}),
			]),
			sink,
		);
		expect(report.refusal).toBeUndefined();
		expect(responses(report)).toMatchObject({ created: 8, orphan: 0 });
		const row = sink.row("responses", "psychotherapy_intake:1");
		expect(row).toMatchObject({
			definitionKey: "psychotherapy-intake",
			definitionVersion: 1,
			clientLegacy: "clients:1",
		});
		expect(Reflect.get(row ?? {}, "visitLegacy")).toBeUndefined();
		expect(Reflect.get(row ?? {}, "practitionerLegacy")).toBeUndefined();
		expect(Reflect.get(row ?? {}, "createdAt")).toBe(Date.parse(T));
		expect(await payloadOf(sink, "psychotherapy_intake:1")).toEqual({
			age: "34",
			category: "adult",
			first_session_date: "2026-11-20",
			presenting_problem: "Anxietate — ședință inițială",
			therapeutic_goals: INTAKE_TEXT,
		});
		// The clinical text is stored only encrypted.
		expect(sink.dump()).not.toContain(INTAKE_TEXT);
	});

	it("an intake whose client is gone is kept unattached, as the feedback tables do", async () => {
		const sink = new MemorySink();
		const report = await run(exportWith([intake({ client_id: 999 })]), sink);
		expect(report.refusal).toBeUndefined();
		expect(sink.row("responses", "psychotherapy_intake:1")).toBeDefined();
		expect(Reflect.get(sink.row("responses", "psychotherapy_intake:1") ?? {}, "clientLegacy")).toBe(
			undefined,
		);
		expect(report.anomalies.find((a) => a.code === ORPHAN_KEPT)?.ids).toContain(
			"psychotherapy_intake:1",
		);
	});
});

describe("idempotency: re-runs never duplicate", () => {
	it("a second run with the old app unchanged writes nothing", async () => {
		const sink = new MemorySink();
		await run(exportWith([intake()]), sink);
		const before = sink.changes;
		const again = await run(exportWith([intake()]), sink);
		expect(again.refusal).toBeUndefined();
		expect(sink.changes).toBe(before);
		expect(responses(again)).toMatchObject({ created: 0, updated: 0, unchanged: 8 });
		expect(sink.version("responses", "psychotherapy_intake:1")).toBe(1);
	});

	it("an intake edited in the old app is updated in place: same row, version 2, nothing added", async () => {
		const sink = new MemorySink();
		await run(exportWith([intake()]), sink);
		const count = sink.count("responses");
		const edited = await run(exportWith([intake({ risk_factors: "Revizuit" })]), sink);
		expect(responses(edited)).toMatchObject({ created: 0, updated: 1 });
		expect(sink.count("responses")).toBe(count);
		expect(sink.version("responses", "psychotherapy_intake:1")).toBe(2);
		expect(await payloadOf(sink, "psychotherapy_intake:1")).toEqual({
			risk_factors: "Revizuit",
			therapeutic_goals: INTAKE_TEXT,
		});
	});
});

describe("side effects: every refusal writes nothing", () => {
	const refused = async (exported: unknown, code: string, id: string) => {
		const sink = new MemorySink();
		const report = await run(exported, sink);
		expect(report.refusal).toBe("blocking");
		expect(report.anomalies.find((a) => a.code === code)?.ids).toEqual([id]);
		expect(sink.changes).toBe(0);
		expect(sink.apps).toEqual([]);
		expect(sink.installed).toEqual([]);
	};

	it("a column the intake template does not know blocks the run", async () => {
		await refused(
			exportWith([intake({ new_column: "x" })]),
			"unmapped_column:psychotherapy_intake.new_column",
			"psychotherapy_intake:1",
		);
	});

	it("a first-session date that is not a date blocks the run", async () => {
		await refused(
			exportWith([intake({ first_session_date: "next week" })]),
			"uncoercible_value:psychotherapy_intake.first_session_date",
			"psychotherapy_intake:1",
		);
	});

	it("an intake with no readable id blocks the run", async () => {
		await refused(
			exportWith([intake({ id: "one" })]),
			"parse_error:psychotherapy_intake:id:invalid_union",
			"psychotherapy_intake:#0",
		);
	});

	for (const table of ["nfb_feedback", "client_therapies"]) {
		it(`${table} still has to be empty: one row refuses the run, intake or not`, async () => {
			const e = exportWith([intake()]);
			e.tables[table] = [{ id: 1 }];
			await refused(e, `table_must_be_empty:${table}`, `${table}:*1`);
		});
	}
});
