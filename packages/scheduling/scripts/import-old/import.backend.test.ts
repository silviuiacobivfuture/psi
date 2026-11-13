import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { generateMasterKeyText } from "../../src/crypto";
import { MemoryStorage } from "../../src/storage";
import { backendReady, dumpTable, runMutation, runQuery } from "../../src/test/admin";
import { CONVEX_DATA, CONVEX_URL } from "../../src/test/backend";
import { createDirSource } from "./files";
import { MAPPING, SENTINELS, syntheticExport } from "./fixture";
import { runImport } from "./run";
import { connect } from "./target";

/**
 * The whole import against a real local Convex backend: the real internal functions, the real
 * schema, a real data key. Synthetic data, in a throwaway `test-…` app that is dropped afterwards.
 * Skipped, with a warning, when no backend is up.
 */
if (!backendReady) console.warn("import.backend.test: no local backend or admin key; see README");

const APP = `test-import-${Date.now().toString(36)}`;
const mapping = { ...MAPPING, app: APP };
const counts = () =>
	runQuery("clinicInspect:counts", { tenant: APP }, z.record(z.string(), z.number())).then(
		(c) => (key: string) => c[key] ?? 0,
	);

describe.skipIf(!backendReady)("the import into the real store", () => {
	const dir = backendReady ? mkdtempSync(join(tmpdir(), "import-old-e2e-")) : "";
	if (backendReady) {
		mkdirSync(join(dir, "client-files", "1"), { recursive: true });
		mkdirSync(join(dir, "avize"), { recursive: true });
		writeFileSync(join(dir, "client-files", "1", "report.pdf"), SENTINELS.fileBytes);
		writeFileSync(join(dir, "avize", "notice.txt"), SENTINELS.fileBytes);
	}
	afterAll(async () => {
		if (!backendReady) return;
		rmSync(dir, { recursive: true, force: true });
		await runMutation("seed:dropFixture", { tenant: APP }, z.object({ deleted: z.number() }));
	});

	it("writes everything, then a second run writes nothing at all", async () => {
		const adminKey = readFileSync(join(CONVEX_DATA, "secrets/admin-key"), "utf8").trim();
		const storage = new MemoryStorage();
		const target = await connect({
			url: CONVEX_URL,
			adminKey,
			masterKey: generateMasterKeyText(),
			mapping,
			storage,
		});
		const options = {
			exported: syntheticExport(),
			mapping,
			ignoreTables: [],
			allowSkips: true,
			files: createDirSource(dir),
			connect: async () => target,
		};

		const first = await runImport(options);
		expect(first.refusal).toBeUndefined();
		const w = Object.fromEntries(first.written.map((x) => [x.kind, x]));
		expect(w.practitioners).toMatchObject({ created: 4, orphan: 0 });
		expect(w.clients).toMatchObject({ created: 7, orphan: 0 });
		expect(w.visits).toMatchObject({ created: 12, orphan: 0 });
		expect(w.responses).toMatchObject({ created: 4, orphan: 0 });
		expect(w.files).toMatchObject({ created: 2, orphan: 0 });
		expect(w.payments).toMatchObject({ created: 1 });
		const after = await counts();
		expect(after("visits")).toBe(12);
		expect(after("clients")).toBe(7);
		expect(after("treating")).toBe(2);
		expect(after("formDefinitions")).toBe(4);
		expect(after("roles")).toBe(7);
		expect(after("rosterDays")).toBe(4);
		expect(after("appKeys")).toBe(1);

		const second = await runImport({ ...options, exported: syntheticExport() });
		for (const row of second.written) {
			expect({
				kind: row.kind,
				created: row.created,
				updated: row.updated,
				orphan: row.orphan,
			}).toEqual({ kind: row.kind, created: 0, updated: 0, orphan: 0 });
		}
		const again = await counts();
		for (const table of [
			"visits",
			"clients",
			"treating",
			"auditEvents",
			"payments",
			"formResponses",
			"files",
			"rosterDays",
		]) {
			expect(again(table)).toBe(after(table));
		}
		expect(storage.objects.size).toBe(2);

		// What is really stored: no clinical text in the clear, anywhere.
		for (const table of ["clients", "visits", "formResponses", "files", "auditEvents", "appKeys"]) {
			const dump = dumpTable(table);
			for (const secret of [
				SENTINELS.diagnosis,
				SENTINELS.notes,
				SENTINELS.reason,
				SENTINELS.therapistNote,
				SENTINELS.feedback,
			]) {
				expect(dump).not.toContain(secret);
			}
		}
		expect(dumpTable("auditEvents")).not.toContain(SENTINELS.name);
		const audit = dumpTable("auditEvents");
		expect(audit).toContain("import.batch");
	}, 120_000);

	it("a refused run makes nothing: no app, no key, no file in the store", async () => {
		const adminKey = readFileSync(join(CONVEX_DATA, "secrets/admin-key"), "utf8").trim();
		const refusedApp = `${APP}-refused`;
		const storage = new MemoryStorage();
		const exported = syntheticExport();
		exported.tables.nfb_feedback = [{ id: 1 }];
		const report = await runImport({
			exported,
			mapping: { ...mapping, app: refusedApp },
			ignoreTables: [],
			allowSkips: true,
			files: createDirSource(dir),
			connect: () =>
				connect({
					url: CONVEX_URL,
					adminKey,
					masterKey: generateMasterKeyText(),
					mapping: { ...mapping, app: refusedApp },
					storage,
				}),
		});
		expect(report.refusal).toBe("blocking");
		const empty = await runQuery(
			"clinicInspect:counts",
			{ tenant: refusedApp },
			z.record(z.string(), z.number()),
		);
		expect(Object.values(empty).every((n) => n === 0)).toBe(true);
		expect(storage.objects.size).toBe(0);
	});
});
