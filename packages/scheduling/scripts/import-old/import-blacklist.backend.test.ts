import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAdminClient } from "../../src/admin-client";
import { validateClinicData } from "../../src/admin-validate";
import { generateMasterKeyText } from "../../src/crypto";
import { MemoryStorage } from "../../src/storage";
import { backendReady, runMutation, runQuery } from "../../src/test/admin";
import { CONVEX_DATA, CONVEX_URL } from "../../src/test/backend";
import { createDirSource } from "./files";
import { MAPPING, SENTINELS, syntheticExport } from "./fixture";
import { runImport } from "./run";
import { connect } from "./target";

/**
 * `--blacklist` into the real store and `validateClinicData` over what was stored: the seed is
 * idempotent and staff-owned (a re-run never revives an entry staff switched off), the store check
 * agrees with the dry run on every finding of the data, changes nothing, and prints no content.
 * Synthetic data, throwaway app. Skipped, with a warning, when no backend is up.
 */
if (!backendReady) console.warn("import-blacklist.backend.test: no local backend; see README");

const serverKey = backendReady
	? readFileSync(join(CONVEX_DATA, "secrets/server-key"), "utf8").trim()
	: "";
const APP = `test-impbl-${Date.now().toString(36)}`;
const mapping = { ...MAPPING, app: APP };
const seed = [
	{
		key: "seed-phone",
		phone: "0700 000 007",
		reason: "synthetic reason A",
		category: "unpaid",
		severity: "block_online",
	},
	{
		key: "seed-client",
		clientLegacy: "clients:1",
		name: "Synthetic Name",
		reason: "synthetic reason B",
		category: "abusive",
		severity: "block_all",
		expires: "2099-12-31",
	},
];

describe.skipIf(!backendReady)("the blacklist seed and the store check", () => {
	const dir = backendReady ? mkdtempSync(join(tmpdir(), "import-bl-")) : "";
	if (backendReady) {
		mkdirSync(join(dir, "client-files", "1"), { recursive: true });
		mkdirSync(join(dir, "avize"), { recursive: true });
		writeFileSync(join(dir, "client-files", "1", "report.pdf"), SENTINELS.fileBytes);
		writeFileSync(join(dir, "avize", "notice.txt"), SENTINELS.fileBytes);
	}
	afterAll(async () => {
		if (!backendReady) return;
		rmSync(dir, { recursive: true, force: true });
		await runMutation("seed:dropFixture", { tenant: APP }, z.unknown());
	});

	it("seeds once, never rewrites what staff changed, and the store check matches the dry run", async () => {
		const adminKey = readFileSync(join(CONVEX_DATA, "secrets/admin-key"), "utf8").trim();
		const target = await connect({
			url: CONVEX_URL,
			adminKey,
			masterKey: generateMasterKeyText(),
			mapping,
			storage: new MemoryStorage(),
		});
		const options = {
			exported: syntheticExport(),
			mapping,
			ignoreTables: [],
			allowSkips: true,
			files: createDirSource(dir),
			blacklist: seed,
			connect: async () => target,
		};
		const counts = () =>
			runQuery("clinicInspect:counts", { tenant: APP }, z.record(z.string(), z.number()));

		const first = await runImport(options);
		expect(first.refusal).toBeUndefined();
		expect(first.written.find((w) => w.kind === "blacklist")).toMatchObject({
			created: 2,
			updated: 0,
			unchanged: 0,
			orphan: 0,
		});
		const stored = await counts();
		expect(stored.blacklistEntries).toBe(2);

		// Staff switch the phone entry off (as the wrapper would).
		const admin = createAdminClient({ url: CONVEX_URL, adminKey });
		const listed = z
			.object({
				entries: z.array(z.object({ id: z.string(), phone: z.string().optional() })),
			})
			.parse(
				await admin.query(
					"apiBlacklist:list",
					{
						key: serverKey,
						tenant: APP,
					},
					z.unknown(),
				),
			);
		const phoneEntry = listed.entries.find((e) => e.phone === "+40700000007");
		expect(phoneEntry).toBeDefined();
		await admin.mutation(
			"apiBlacklist:update",
			{
				key: serverKey,
				tenant: APP,
				actor: { subject: "sub-test" },
				entry: phoneEntry?.id,
				patch: { active: false },
			},
			z.unknown(),
		);
		const beforeRerun = await counts();

		const again = await runImport({ ...options, exported: syntheticExport() });
		expect(again.written.find((w) => w.kind === "blacklist")).toMatchObject({
			created: 0,
			updated: 0,
			unchanged: 2,
		});
		const afterRerun = await counts();
		expect(afterRerun.blacklistEntries).toBe(2);
		expect(afterRerun.auditEvents).toBe(beforeRerun.auditEvents);
		// The switched-off entry stayed off.
		const all = await admin.query(
			"apiBlacklist:list",
			{ key: serverKey, tenant: APP, includeInactive: true },
			z.object({ entries: z.array(z.object({ id: z.string(), active: z.boolean() })) }),
		);
		expect(all.entries.find((e) => e.id === phoneEntry?.id)?.active).toBe(false);

		// The store check: same findings as the dry run on the data, bar the active-entry effects.
		const dry = await runImport({ ...options, connect: undefined });
		const stored1 = await validateClinicData(admin, APP, Date.parse("2026-11-13T09:00:00Z"));
		const wanted = (dry.validation?.findings ?? []).filter(
			(f) => f.code !== "client_blacklisted" && f.code !== "visit_overlap",
		);
		const got = (stored1?.findings ?? []).filter(
			(f) => f.code !== "client_blacklisted" && f.code !== "visit_overlap",
		);
		expect(got.map((f) => [f.code, f.count, f.labels])).toEqual(
			wanted.map((f) => [f.code, f.count, f.labels]),
		);
		// With the phone entry off, only the client entry (clients:1) flags a client.
		expect(stored1?.findings.find((f) => f.code === "client_blacklisted")?.labels).toEqual([
			"clients:1",
		]);
		// The overlap the detector found in the dry run is found in the store, by old id.
		expect(stored1?.findings.find((f) => f.code === "visit_overlap")?.labels).toEqual([
			"appointments:100",
			"appointments:121",
		]);
		// Nothing was changed by checking, and nothing personal is in the report.
		expect(await counts()).toEqual(afterRerun);
		const text = JSON.stringify(stored1);
		for (const secret of [
			"synthetic reason",
			"Synthetic Name",
			"0700 000",
			"700000007",
			SENTINELS.name,
		]) {
			expect(text).not.toContain(secret);
		}
		expect(await validateClinicData(admin, `${APP}-nope`)).toBeUndefined();
	}, 120_000);
});
