import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildKeyRing,
	encryptBytes,
	encryptField,
	fingerprint,
	generateDataKeyBytes,
	generateMasterKeyText,
	parseMasterKey,
	wrapDataKey,
} from "../../src/crypto";
import { MemoryStorage } from "../../src/storage";
import { createDirSource } from "./files";
import { cloneExport, MAPPING, SENTINELS } from "./fixture";
import { MemorySink } from "./memory-sink";
import { ORPHAN_KEPT } from "./records";
import { formatReport, type Report } from "./report";
import { runImport } from "./run";
import type { Encryptor } from "./support";

/**
 * Feedback rows whose client is gone in the old app (client_id null, or a client the export does not hold) are kept:
 * imported with no client, on their visit when it is known, noted (never skipped), and idempotent by their old id.
 */
const TENANT = MAPPING.app;
let enc: Encryptor;
let filesDir = "";

beforeAll(async () => {
	const master = await parseMasterKey(generateMasterKeyText());
	const ring = await buildKeyRing(master, TENANT, [
		await wrapDataKey(master, generateDataKeyBytes(), TENANT, 1),
	]);
	enc = {
		encrypt: (plain, field) => encryptField(ring, plain, `${TENANT}|${field}`),
		fingerprint: (message) => fingerprint(ring, message),
		encryptBytes: (bytes, context) => encryptBytes(ring, bytes, `${TENANT}|${context}`),
	};
	filesDir = mkdtempSync(join(tmpdir(), "import-old-orphans-"));
	mkdirSync(join(filesDir, "client-files", "1"), { recursive: true });
	mkdirSync(join(filesDir, "avize"), { recursive: true });
	writeFileSync(join(filesDir, "client-files", "1", "report.pdf"), SENTINELS.fileBytes);
	writeFileSync(join(filesDir, "avize", "notice.txt"), SENTINELS.fileBytes);
});

afterAll(() => rmSync(filesDir, { recursive: true, force: true }));

/** The synthetic export plus three feedback rows of deleted clients: known visit, unknown visit, no visit. */
function withOrphans(): ReturnType<typeof cloneExport> {
	const exported = cloneExport();
	const t = exported.tables;
	const at = "2026-03-02T10:00:00Z";
	const session = t.session_feedback ?? [];
	session.push(
		{
			id: 50,
			appointment_id: 100,
			client_id: null,
			therapist_id: 1,
			created_at: at,
			updated_at: at,
			programs: [],
			intervention_efficiency: "",
			parent_feedback: "Test orphan feedback",
		},
		{
			id: 51,
			appointment_id: 99_999,
			client_id: 4242,
			therapist_id: 1,
			created_at: at,
			updated_at: at,
			programs: [],
			intervention_efficiency: "",
			parent_feedback: "",
		},
	);
	t.session_feedback = session;
	const race = t.racemeup_feedback ?? [];
	race.push({
		id: 9,
		appointment_id: null,
		client_id: null,
		therapist_id: 3,
		created_at: at,
		updated_at: at,
		posts: [],
	});
	t.racemeup_feedback = race;
	return exported;
}

const ORPHANS = ["racemeup_feedback:9", "session_feedback:50", "session_feedback:51"];
const options = (exported: unknown, sink?: MemorySink) => ({
	mapping: MAPPING,
	ignoreTables: [] as string[],
	allowSkips: true,
	files: createDirSource(filesDir),
	exported,
	connect:
		sink === undefined ? undefined : async () => ({ sink, enc, storage: new MemoryStorage() }),
});
const anomaly = (r: Report, code: string) => r.anomalies.find((a) => a.code === code);

describe("feedback whose client is gone", () => {
	it("the dry run plans every orphan row and notes it, never skips it", async () => {
		const report = await runImport(options(withOrphans()));
		const get = (table: string) => report.tables.find((x) => x.table === table);
		expect(get("session_feedback")).toMatchObject({ source: 4, planned: 4 });
		expect(get("racemeup_feedback")).toMatchObject({ source: 2, planned: 2 });
		expect(anomaly(report, ORPHAN_KEPT)).toEqual({
			code: ORPHAN_KEPT,
			severity: "note",
			count: 3,
			ids: expect.arrayContaining(ORPHANS),
		});
		expect(anomaly(report, "orphan_feedback_client")).toBeUndefined();
		const skippedIds = report.anomalies
			.filter((a) => a.severity === "skipped")
			.flatMap((a) => a.ids);
		for (const id of ORPHANS) expect(skippedIds).not.toContain(id);
		// The unknown visit is its own note, as for any feedback row.
		expect(anomaly(report, "orphan_feedback_appointment")?.ids).toContain("session_feedback:51");
		expect(formatReport(report)).toContain(ORPHAN_KEPT);
	});

	it("the export without orphans notes nothing of the kind", async () => {
		const report = await runImport(options(cloneExport()));
		expect(anomaly(report, ORPHAN_KEPT)).toBeUndefined();
	});

	it("the real run writes them with no client, on their visit when known, and a rerun writes nothing", async () => {
		const sink = new MemorySink();
		const first = await runImport(options(withOrphans(), sink));
		expect(first.refusal).toBeUndefined();
		const responses = first.written.find((w) => w.kind === "responses");
		expect(responses).toMatchObject({ created: 10, updated: 0, orphan: 0 });

		const known = sink.row("responses", "session_feedback:50");
		expect(known).toMatchObject({
			legacyId: "session_feedback:50",
			definitionKey: "aba-session-report",
			visitLegacy: "appointments:100",
		});
		expect(known === undefined ? "absent" : Reflect.get(known, "clientLegacy")).toBeUndefined();
		expect(known === undefined ? undefined : Reflect.get(known, "practitionerLegacy")).toBeTypeOf(
			"string",
		);
		for (const id of ["session_feedback:51", "racemeup_feedback:9"]) {
			const row = sink.row("responses", id);
			expect(row).toBeDefined();
			expect(row === undefined ? "absent" : Reflect.get(row, "clientLegacy")).toBeUndefined();
			expect(row === undefined ? "absent" : Reflect.get(row, "visitLegacy")).toBeUndefined();
		}
		// The answers are ciphertext like every other response.
		expect(JSON.stringify(sink.row("responses", "session_feedback:50"))).not.toContain(
			"Test orphan feedback",
		);
		// A row whose client is known keeps it.
		expect(sink.row("responses", "session_feedback:1")).toMatchObject({
			clientLegacy: "clients:1",
		});

		const changes = sink.changes;
		const second = await runImport(options(withOrphans(), sink));
		expect(second.written.find((w) => w.kind === "responses")).toMatchObject({
			created: 0,
			updated: 0,
			orphan: 0,
		});
		expect(sink.changes).toBe(changes);
	});
});
