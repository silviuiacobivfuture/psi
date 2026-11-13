import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
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
import { cloneExport, MAPPING, SENTINELS, syntheticExport } from "./fixture";
import { MemorySink } from "./memory-sink";
import type { Report } from "./report";
import { runImport } from "./run";
import type { Kind, RowsByKind, UpsertResult } from "./sink";
import type { Encryptor } from "./support";

const run = promisify(execFile);
const TENANT = MAPPING.app;

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

describe("refusals: nothing is written", () => {
	const attempt = async (mutate: (e: ReturnType<typeof syntheticExport>) => void, over = {}) => {
		const sink = new MemorySink();
		const exported = cloneExport();
		mutate(exported);
		const report = await runImport({
			...base(),
			exported,
			connect: async () => ({ sink, enc, storage: new MemoryStorage() }),
			...over,
		});
		return { sink, report };
	};

	it("a non-empty table that must be empty fails loudly", async () => {
		const { sink, report } = await attempt((e) => {
			e.tables.nfb_feedback = [{ id: 1 }];
		});
		expect(report.refusal).toBe("blocking");
		expect(idsOf(report, "table_must_be_empty:nfb_feedback")).toEqual(["nfb_feedback:*1"]);
		expect(sink.changes).toBe(0);
		expect(sink.apps).toEqual([]);
	});

	it("a table nothing maps, unless the owner ignores it", async () => {
		const { sink, report } = await attempt((e) => {
			e.tables.users = [{ id: 1, email: "x" }];
		});
		expect(report.refusal).toBe("blocking");
		expect(sink.changes).toBe(0);
		const ignored = await attempt(
			(e) => {
				e.tables.users = [{ id: 1, email: "x" }];
			},
			{ ignoreTables: ["users"] },
		);
		expect(ignored.report.refusal).toBeUndefined();
	});

	it("a non-empty column nothing reads is blocking, named by column only", async () => {
		const { sink, report } = await attempt((e) => {
			const row = e.tables.session_feedback?.[0];
			if (row !== undefined)
				Reflect.set(row as object, "surprise_column", "SENTINEL-SURPRISE-VALUE");
		});
		expect(report.refusal).toBe("blocking");
		expect(idsOf(report, "unmapped_column:session_feedback.surprise_column")).toEqual([
			"session_feedback:1",
		]);
		expect(JSON.stringify(report)).not.toContain("SENTINEL-SURPRISE-VALUE");
		expect(sink.changes).toBe(0);
	});

	it("an empty unknown column is harmless", async () => {
		const { report } = await attempt((e) => {
			const row = e.tables.clients?.[0];
			if (row !== undefined) Reflect.set(row as object, "extra", null);
		});
		expect(report.refusal).toBeUndefined();
	});

	it("an empty string is an absent value in every optional column, numbers and text alike", async () => {
		const { report } = await attempt((e) => {
			const c = e.tables.clients?.[2];
			if (c !== undefined) {
				Reflect.set(c as object, "therapist_id", "");
				Reflect.set(c as object, "phone", "");
				Reflect.set(c as object, "first_therapy", "");
			}
			const a = e.tables.appointments?.[0];
			if (a !== undefined) {
				Reflect.set(a as object, "room_id", "");
				Reflect.set(a as object, "nfb_device_id", "");
				Reflect.set(a as object, "subscription_id", "");
			}
		});
		expect(report.refusal).toBeUndefined();
		expect(report.anomalies.filter((a) => a.code.startsWith("parse_error"))).toEqual([]);
	});

	it("a value that cannot be read as its field's type is blocking, naming the field", async () => {
		const { sink, report } = await attempt((e) => {
			const row = e.tables.psychotherapy_feedback?.[0];
			if (row !== undefined) Reflect.set(row as object, "next_session_date", "SENTINEL-NOT-A-DATE");
		});
		expect(report.refusal).toBe("blocking");
		expect(idsOf(report, "uncoercible_value:psychotherapy_feedback.next_session_date")).toEqual([
			"psychotherapy_feedback:1",
		]);
		expect(JSON.stringify(report)).not.toContain("SENTINEL-NOT-A-DATE");
		expect(sink.changes).toBe(0);
	});

	it("the anonymizer's stand-in text where a list belongs is an empty answer and a note, never blocking", async () => {
		const { sink, report } = await attempt((e) => {
			const row = e.tables.session_feedback?.[0];
			if (row !== undefined)
				for (const key of ["receptive_to", "rewards_used", "triggers"])
					Reflect.set(
						row as object,
						key,
						"[text de test — conținutul real nu este copiat în acest mediu]",
					);
		});
		expect(report.refusal).toBeUndefined();
		expect(report.anomalies.filter((a) => a.code.startsWith("uncoercible_value"))).toEqual([]);
		expect(idsOf(report, "placeholder_text:session_feedback.receptive_to")).toEqual([
			"session_feedback:1",
		]);
		expect(sink.changes).toBeGreaterThan(0);
	});

	it("a value outside its field's bounds is blocking", async () => {
		const { report } = await attempt((e) => {
			const row = e.tables.parent_feedback?.[0];
			if (row !== undefined) Reflect.set(row as object, "reception_rating", 99);
		});
		expect(report.refusal).toBe("blocking");
		expect(idsOf(report, "invalid_value:parent_feedback.reception_rating:invalid")).toEqual([
			"parent_feedback:1",
		]);
	});

	it("a table cell that is not a plain value, or a row that is not a row, is blocking", async () => {
		const { report } = await attempt((e) => {
			const row = e.tables.session_feedback?.[0];
			if (row !== undefined)
				Reflect.set(row as object, "programs", [{ name: { nested: "SENTINEL-CELL" } }]);
			const rmu = e.tables.racemeup_feedback?.[0];
			if (rmu !== undefined) Reflect.set(rmu as object, "posts", ["not a row"]);
		});
		expect(report.refusal).toBe("blocking");
		expect(idsOf(report, "uncoercible_value:session_feedback.programs")).toEqual([
			"session_feedback:1",
		]);
		expect(idsOf(report, "uncoercible_value:racemeup_feedback.posts")).toEqual([
			"racemeup_feedback:1",
		]);
		expect(JSON.stringify(report)).not.toContain("SENTINEL-CELL");
	});

	it("text above a cap is kept whole and noted, at cap-1 and cap nothing is said; never blocking", async () => {
		const run = async (n: number) => {
			const sink = new MemorySink();
			const exported = cloneExport();
			const row = exported.tables.session_feedback?.[0];
			if (row !== undefined) {
				Reflect.set(row as object, "other_behavior", "x".repeat(4_000 + n));
				Reflect.set(row as object, "other_details", "y".repeat(50_000 + n));
				Reflect.set(row as object, "receptive_to", ["z".repeat(4_000 + n)]);
				Reflect.set(row as object, "reward_quality", "q".repeat(4_000 + n));
				Reflect.set(row as object, "programs", [
					{
						name: "n".repeat(20_000 + n),
						prompt: "p".repeat(20_000 + n),
						notes: "m".repeat(50_000 + n),
					},
				]);
			}
			const report = await runImport({
				...base(),
				exported,
				connect: async () => ({ sink, enc, storage: new MemoryStorage() }),
			});
			return { sink, report };
		};
		for (const n of [-1, 0]) {
			const { report } = await run(n);
			expect(report.refusal).toBeUndefined();
			expect(report.anomalies.filter((a) => a.code.startsWith("over_cap"))).toEqual([]);
		}
		const { sink, report } = await run(1);
		expect(report.refusal).toBeUndefined();
		expect(idsOf(report, "over_cap:session_feedback.other_behaviour")).toEqual([
			"session_feedback:1",
		]);
		for (const f of ["other_details", "receptive_to", "reward_quality", "programs"]) {
			expect(idsOf(report, `over_cap:session_feedback.${f}`)).toEqual(["session_feedback:1"]);
		}
		expect(report.anomalies.find((a) => a.code.startsWith("over_cap"))?.severity).toBe("note");
		const stored = JSON.parse(
			await decryptField(
				ring,
				Reflect.get(sink.row("responses", "session_feedback:1") ?? {}, "payload"),
				`${TENANT}|formResponses.payload`,
			),
		);
		expect(stored.other_behaviour).toHaveLength(4_001);
		expect(stored.other_details).toHaveLength(50_001);
		expect(stored.receptive_to[0]).toHaveLength(4_001);
		expect(stored.programs[0].name).toHaveLength(20_001);
		expect(stored.programs[0].notes).toHaveLength(50_001);
	});

	it("a row that does not parse is blocking and reported without its value", async () => {
		const { sink, report } = await attempt((e) => {
			e.tables.clients?.push({ id: "SENTINEL-NOT-AN-ID", name: "x" });
			e.tables.clients?.push({ id: 50, name: "Test Client Z", therapist_id: "SENTINEL-BAD" });
		});
		expect(report.refusal).toBe("blocking");
		const parse = report.anomalies.filter((a) => a.code.startsWith("parse_error:clients"));
		expect(parse.flatMap((a) => a.ids).sort()).toEqual(["clients:#7", "clients:50"]);
		expect(JSON.stringify(report)).not.toContain("SENTINEL");
		expect(sink.changes).toBe(0);
	});

	it("an export that is not an export, and one with a missing required table", async () => {
		const sink = new MemorySink();
		const bad = await runImport({
			...base(),
			exported: { nope: 1 },
			connect: async () => ({ sink, enc, storage: new MemoryStorage() }),
		});
		expect(bad.fatal).toBe("the export is not { exported_at, tables }");
		const { report } = await attempt((e) => {
			delete e.tables.appointments;
		});
		expect(report.refusal).toBe("blocking");
		expect(idsOf(report, "required_table_missing:appointments")).toEqual(["appointments:*"]);
		const dated = await runImport({
			...base(),
			exported: { exported_at: "never", tables: {} },
			connect: undefined,
		});
		expect(dated.fatal).toBe("exported_at is not a date");
	});

	it("rows that cannot be placed refuse the run unless skips are allowed", async () => {
		const refused = await attempt(() => {}, { allowSkips: false });
		expect(refused.report.refusal).toBe("skipped");
		expect(refused.sink.changes).toBe(0);
		const allowed = await attempt(() => {}, { allowSkips: true });
		expect(allowed.report.refusal).toBeUndefined();
		expect(allowed.sink.changes).toBeGreaterThan(0);
	});

	it("files without a source directory, a missing file and a path that climbs out are reported", async () => {
		const none = await attempt(() => {}, { files: undefined });
		expect(none.report.refusal).toBe("blocking");
		expect(idsOf(none.report, "files_dir_required")).toEqual(["client_files:1", "avize:1"]);
		const odd = await attempt((e) => {
			const files = e.tables.client_files;
			if (files !== undefined)
				files.push({
					id: 2,
					client_id: 1,
					file_name: "a",
					file_path: "../../etc/passwd",
					file_size: 1,
					file_type: "x",
					uploaded_by: "u",
					created_at: null,
				});
			if (files !== undefined)
				files.push({
					id: 3,
					client_id: 1,
					file_name: "b",
					file_path: "missing.pdf",
					file_size: 1,
					file_type: "x",
					uploaded_by: "u",
					created_at: null,
				});
		});
		expect(idsOf(odd.report, "unsafe_file_path")).toEqual(["client_files:2"]);
		expect(idsOf(odd.report, "file_missing_on_disk")).toEqual(["client_files:3"]);
		expect(odd.sink.count("files")).toBe(2);
	});

	it("an orphan the store reports is counted, not a crash", async () => {
		const sink = new MemorySink();
		const report = await runImport({
			...base(),
			exported: syntheticExport(),
			connect: async () => ({ sink: new OrphaningSink(sink), enc, storage: new MemoryStorage() }),
		});
		expect(report.written.find((w) => w.kind === "visits")?.orphan).toBe(12);
		expect(idsOf(report, "not_written:missing:client")).toContain("appointments:100");
	});
});

class OrphaningSink extends MemorySink {
	constructor(private readonly inner: MemorySink) {
		super();
	}

	override async upsert<K extends Kind>(
		tenant: string,
		kind: K,
		rows: ReadonlyArray<RowsByKind[K]>,
	): Promise<UpsertResult[]> {
		if (kind === "visits") {
			return rows.map((r) => ({
				legacyId: String(Reflect.get(r, "legacyId")),
				outcome: "orphan" as const,
				flag: "missing:client",
			}));
		}
		return this.inner.upsert(tenant, kind, rows);
	}
}

describe("a refused run touches nothing", () => {
	it("never connects, never makes the app or a key, never uploads a file", async () => {
		const exported = cloneExport();
		exported.tables.nfb_feedback = [{ id: 1 }];
		const sink = new MemorySink();
		const storage = new MemoryStorage();
		let connected = 0;
		const report = await runImport({
			...base(),
			exported,
			connect: async () => {
				connected += 1;
				return { sink, enc, storage };
			},
		});
		expect(report.refusal).toBe("blocking");
		expect(connected).toBe(0);
		expect(sink.apps).toEqual([]);
		expect(sink.installed).toEqual([]);
		expect(sink.changes).toBe(0);
		expect(storage.objects.size).toBe(0);
	});

	it("a skipped row refuses before connecting too", async () => {
		let connected = 0;
		const storage = new MemoryStorage();
		const report = await runImport({
			...base(),
			allowSkips: false,
			exported: syntheticExport(),
			connect: async () => {
				connected += 1;
				return { sink: new MemorySink(), enc, storage };
			},
		});
		expect(report.refusal).toBe("skipped");
		expect(connected).toBe(0);
		expect(storage.objects.size).toBe(0);
	});

	it("a slug the store already uses for another row blocks the run before any row is written", async () => {
		const sink = new MemorySink();
		await sink.upsert(TENANT, "practitioners", [
			{ legacyId: "web:1", fingerprint: "x", slug: "t1", displayName: "Existing", active: true },
		]);
		const storage = new MemoryStorage();
		const report = await runImport({
			...base(),
			exported: syntheticExport(),
			connect: async () => ({ sink, enc, storage }),
		});
		expect(report.refusal).toBe("blocking");
		expect(idsOf(report, "slug_taken:practitioners")).toEqual(["therapists:1"]);
		expect(sink.count("clients")).toBe(0);
		expect(sink.count("practitioners")).toBe(1);
		expect(storage.objects.size).toBe(0);
	});

	it("a time of day that does not exist on the roster is an anomaly, not a crash", async () => {
		const exported = cloneExport();
		const row = exported.tables.staff_schedule?.[0];
		if (row !== undefined) Reflect.set(row as object, "start_time", "24:30");
		const report = await runImport({ ...base(), exported, connect: undefined });
		expect(idsOf(report, "roster_works_without_valid_hours")).toEqual([
			"staff_schedule:1",
			"staff_schedule:7",
		]);
	});
});

describe("the command line", () => {
	it("a dry run needs no key and no network, prints aggregates and old ids only, and exits 0", async () => {
		const dir = mkdtempSync(join(tmpdir(), "import-old-cli-"));
		try {
			const exportPath = join(dir, "export.json");
			const mappingPath = join(dir, "mapping.json");
			writeFileSync(exportPath, JSON.stringify(syntheticExport()));
			writeFileSync(mappingPath, JSON.stringify(MAPPING));
			const result = await run(
				resolve(import.meta.dirname, "../../node_modules/.bin/tsx"),
				[
					resolve(import.meta.dirname, "main.ts"),
					"--dry-run",
					"--export",
					exportPath,
					"--mapping",
					mappingPath,
					"--files",
					filesDir,
				],
				{ env: { PATH: process.env.PATH ?? "" }, cwd: resolve(import.meta.dirname, "../..") },
			);
			expect(result.stdout).toContain("import dry-run");
			expect(result.stdout).toContain("series_practitioner_change: 1  appointments:112");
			for (const value of Object.values(SENTINELS))
				expect(result.stdout + result.stderr).not.toContain(value);
			expect(result.stdout + result.stderr).not.toContain("Test Client");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 60_000);

	it("a real run without its environment refuses before touching anything, naming the variables", async () => {
		const dir = mkdtempSync(join(tmpdir(), "import-old-cli-"));
		try {
			const exportPath = join(dir, "export.json");
			const mappingPath = join(dir, "mapping.json");
			writeFileSync(exportPath, JSON.stringify(syntheticExport()));
			writeFileSync(mappingPath, JSON.stringify(MAPPING));
			const failure = await run(
				resolve(import.meta.dirname, "../../node_modules/.bin/tsx"),
				[resolve(import.meta.dirname, "main.ts"), "--export", exportPath, "--mapping", mappingPath],
				{ env: { PATH: process.env.PATH ?? "" }, cwd: resolve(import.meta.dirname, "../..") },
			).catch((e: { code?: number; stderr?: string }) => e);
			expect(failure).toMatchObject({ code: 2 });
			expect((failure as { stderr: string }).stderr).toContain("CONVEX_SELF_HOSTED_URL");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 60_000);
});
