import { beforeAll, describe, expect, it } from "vitest";
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
import { MemoryStorage } from "../../src/storage";
import { cloneExport, MAPPING, SENTINELS } from "../import-old/fixture";
import { MemorySink } from "../import-old/memory-sink";
import type { Encryptor } from "../import-old/support";
import { anonymizeExport } from "./anonymize";
import {
	createFakeOldApp,
	FAKE_EMAIL,
	FAKE_PASSWORD,
	FAKE_URL,
	type FakeOldApp,
} from "./fake-old-app";
import { createRemoteFileSource, fetchExport } from "./old-app";
import { createReadOnlyClient, signIn } from "./readonly-client";
import { formatSync, realDataAllowed, runSync, type SyncResult } from "./sync";

type Row = Record<string, unknown>;
const TENANT = MAPPING.app;
let enc: Encryptor;

beforeAll(async () => {
	const master = await parseMasterKey(generateMasterKeyText());
	const ring: KeyRing = await buildKeyRing(master, TENANT, [
		await wrapDataKey(master, generateDataKeyBytes(), TENANT, 1),
	]);
	enc = {
		encrypt: (plain, field) => encryptField(ring, plain, `${TENANT}|${field}`),
		fingerprint: (message) => fingerprint(ring, message),
		encryptBytes: (bytes, context) => encryptBytes(ring, bytes, `${TENANT}|${context}`),
	};
});

const FILES: Array<[string, Uint8Array<ArrayBuffer>]> = [
	["client-files/1/report.pdf", new TextEncoder().encode(SENTINELS.fileBytes)],
	["avize/notice.txt", new TextEncoder().encode(SENTINELS.fileBytes)],
];

/** The old app as it is now: the importer's synthetic export behind a fake Supabase. */
function oldApp(edit: (tables: Record<string, Row[]>) => void = () => undefined): FakeOldApp {
	const tables = cloneExport().tables as Record<string, Row[]>;
	edit(tables);
	return createFakeOldApp(tables, FILES);
}

/** One sync pass, the way main.ts does it: sign in, read the old app, (anonymize), compare, write. */
async function pass(
	fake: FakeOldApp,
	sink: MemorySink,
	over: { dryRun?: boolean; anonymize?: boolean; emptyTarget?: boolean } = {},
): Promise<SyncResult> {
	const token = await signIn({
		url: FAKE_URL,
		anonKey: "anon-key-0123456789",
		email: FAKE_EMAIL,
		password: FAKE_PASSWORD,
		fetch: fake.fetch,
	});
	const client = createReadOnlyClient({
		url: FAKE_URL,
		anonKey: "anon-key-0123456789",
		accessToken: token,
		fetch: fake.fetch,
	});
	const fetched = await fetchExport(client, () => new Date("2026-11-13T09:00:00Z"));
	const anon = over.anonymize === true ? anonymizeExport(fetched) : undefined;
	const target = { sink, enc, storage: new MemoryStorage() };
	return runSync({
		exported: anon?.export ?? fetched,
		files: anon?.files ?? createRemoteFileSource(client),
		mapping: MAPPING,
		allowSkips: true,
		ignoreTables: [],
		dryRun: over.dryRun ?? false,
		openReadOnly: async () => (over.emptyTarget === true ? undefined : target),
		openWrite: async () => target,
	});
}

const written = (r: SyncResult, kind: string) => r.report.written.find((w) => w.kind === kind);
const diff = (r: SyncResult, kind: string) => r.kinds.find((k) => k.kind === kind);

describe("the first sync, then a second", () => {
	it("the first run creates everything; a second run with the old app unchanged writes nothing", async () => {
		const fake = oldApp();
		const sink = new MemorySink();
		const first = await pass(fake, sink);
		expect(first.refused).toBe(false);
		expect(written(first, "clients")).toMatchObject({ created: 7 });
		const changesAfterFirst = sink.changes;
		expect(changesAfterFirst).toBeGreaterThan(40);

		const second = await pass(fake, sink);
		expect(second.refused).toBe(false);
		expect(sink.changes).toBe(changesAfterFirst);
		for (const w of second.report.written)
			expect(w, w.kind).toMatchObject({ created: 0, updated: 0 });
		for (const k of second.kinds) expect(k, k.kind).toMatchObject({ created: 0, changed: 0 });
		expect(diff(second, "clients")).toMatchObject({ unchanged: 7 });
		expect(diff(second, "files")).toMatchObject({ unchanged: 2 });
	});

	it("a row changed in the old app is updated (its version bumps), the rest is left alone", async () => {
		const sink = new MemorySink();
		await pass(oldApp(), sink);
		const before = sink.changes;
		const edited = oldApp((t) => {
			const c = t.clients?.find((r) => r.id === 2);
			if (c !== undefined) c.phone = "0700 000 099";
		});
		const result = await pass(edited, sink);
		expect(diff(result, "clients")).toMatchObject({ created: 0, changed: 1, unchanged: 6 });
		expect(written(result, "clients")).toMatchObject({ created: 0, updated: 1, unchanged: 6 });
		expect(sink.changes).toBe(before + 1);
		expect(sink.version("clients", "clients:2")).toBe(2);
		expect(sink.version("clients", "clients:1")).toBe(1);
	});

	it("a row added in the old app is inserted", async () => {
		const sink = new MemorySink();
		await pass(oldApp(), sink);
		const added = oldApp((t) => {
			t.clients?.push({
				...(t.clients[0] ?? {}),
				id: 50,
				name: "Test Client Z",
				phone: "0700 000 050",
			});
		});
		const result = await pass(added, sink);
		expect(diff(result, "clients")).toMatchObject({ created: 1, changed: 0 });
		expect(written(result, "clients")).toMatchObject({ created: 1, updated: 0 });
		expect(sink.count("clients")).toBe(8);
	});

	it("a row deleted in the old app is REPORTED, with its old id, and never deleted from the store", async () => {
		const sink = new MemorySink();
		await pass(oldApp(), sink);
		const stored = JSON.stringify([...sink.tables].map(([k, t]) => [k, [...t.keys()]]));
		const dropped = oldApp((t) => {
			t.staff_blocks = (t.staff_blocks ?? []).filter((r) => r.id !== 1);
			t.optimo_volunteers = [];
		});
		const result = await pass(dropped, sink);
		expect(diff(result, "blocks")?.absent).toEqual(["staff_blocks:1"]);
		expect(diff(result, "groups")?.absent).toEqual([]);
		expect(result.kinds.flatMap((k) => k.absent).sort()).toEqual([
			"optimo_volunteers:1",
			"staff_blocks:1",
		]);
		// Nothing was removed: the store holds exactly the ids it held.
		expect(JSON.stringify([...sink.tables].map(([k, t]) => [k, [...t.keys()]]))).toBe(stored);
		const text = formatSync(result, true);
		expect(text).toContain("gone from the old app (reported, never deleted here)");
		expect(text).toContain("staff_blocks:1");
	});

	it("a deleted row is reported again on every pass until someone decides, and keeps being kept", async () => {
		const sink = new MemorySink();
		await pass(oldApp(), sink);
		const dropped = oldApp((t) => {
			t.staff_blocks = (t.staff_blocks ?? []).filter((r) => r.id !== 1);
		});
		for (let i = 0; i < 2; i += 1)
			expect(diff(await pass(dropped, sink), "blocks")?.absent).toEqual(["staff_blocks:1"]);
		expect(sink.count("blocks")).toBe(1);
	});

	it("rows the importer skips are not reported as gone: they are still in the old app", async () => {
		const sink = new MemorySink();
		const fake = oldApp();
		await pass(fake, sink);
		const result = await pass(fake, sink);
		// appointments:133 and others are skipped by the importer (unknown status) but exist in the old app.
		expect(result.kinds.flatMap((k) => k.absent)).toEqual([]);
	});
});

describe("the dry run", () => {
	it("compares and writes nothing; counts only, no personal data, no id", async () => {
		const sink = new MemorySink();
		await pass(oldApp(), sink);
		const before = { changes: sink.changes, dump: sink.dump() };
		const edited = oldApp((t) => {
			const c = t.clients?.find((r) => r.id === 2);
			if (c !== undefined) c.email = "someone@example.com";
			t.staff_blocks = [];
		});
		const result = await pass(edited, sink, { dryRun: true });
		expect(result.mode).toBe("dry-run");
		expect(diff(result, "clients")).toMatchObject({ changed: 1 });
		expect(diff(result, "blocks")?.absent).toEqual(["staff_blocks:1"]);
		expect(result.report.written).toEqual([]);
		expect(sink.changes).toBe(before.changes);
		expect(sink.dump()).toBe(before.dump);
		const text = formatSync(result, false);
		expect(text).toContain("blocks");
		for (const personal of [
			...Object.values(SENTINELS),
			"Test Client",
			"Test Guardian",
			"someone@example.com",
			"staff_blocks:1",
			"clients:2",
		])
			expect(text).not.toContain(personal);
	});

	it("against a target with nothing in it, says so and counts every row as new", async () => {
		const sink = new MemorySink();
		const result = await pass(oldApp(), sink, { dryRun: true, emptyTarget: true });
		expect(result.emptyTarget).toBe(true);
		expect(result.report.tables.find((t) => t.table === "clients")).toMatchObject({
			source: 7,
			planned: 7,
		});
		expect(formatSync(result, false)).toContain("the target holds no data yet");
		expect(sink.changes).toBe(0);
		expect(sink.apps).toEqual([]);
	});
});

describe("what blocks a sync", () => {
	it("a column or table the importer does not know refuses the run: nothing is written", async () => {
		const sink = new MemorySink();
		const result = await pass(
			oldApp((t) => {
				t.surprise_table = [{ id: 1, secret: "x" }];
			}),
			sink,
		).catch((e: unknown) => e);
		// An unknown table is never fetched (only the importer's tables are read), so the sync is unaffected by it.
		expect((result as SyncResult).refused).toBe(false);

		const blocked = await pass(
			oldApp((t) => {
				const c = t.clients?.[0];
				if (c !== undefined) c.shoe_size = "42";
			}),
			new MemorySink(),
		);
		expect(blocked.refused).toBe(true);
		expect(blocked.report.refusal).toBe("blocking");
		expect(blocked.report.written).toEqual([]);
	});

	it("a refused run leaves the store exactly as it was", async () => {
		const sink = new MemorySink();
		await pass(oldApp(), sink);
		const before = { changes: sink.changes, dump: sink.dump() };
		const blocked = await pass(
			oldApp((t) => {
				const c = t.clients?.[0];
				if (c !== undefined) c.shoe_size = "42";
			}),
			sink,
		);
		expect(blocked.refused).toBe(true);
		expect(sink.changes).toBe(before.changes);
		expect(sink.dump()).toBe(before.dump);
	});
});

describe("--anonymize feeds the same store with dummy identities", () => {
	it("syncs, and no real identifier reaches the target; a second run is still a no-op", async () => {
		const fake = oldApp();
		const sink = new MemorySink();
		const first = await pass(fake, sink, { anonymize: true });
		expect(first.refused).toBe(false);
		const dump = sink.dump();
		for (const real of [
			SENTINELS.name,
			SENTINELS.phone,
			SENTINELS.diagnosis,
			SENTINELS.notes,
			SENTINELS.reason,
			"Test Guardian",
			"Test notice",
			"Test Volunteer",
			"report.pdf",
			"notice.txt",
		])
			expect(dump, real).not.toContain(real);
		const changes = sink.changes;
		const second = await pass(fake, sink, { anonymize: true });
		expect(second.refused).toBe(false);
		expect(sink.changes).toBe(changes);
	});

	it("never downloads a file from the old app", async () => {
		const fake = oldApp();
		await pass(fake, new MemorySink(), { anonymize: true });
		expect(fake.requests.filter((r) => r.path.startsWith("/storage/"))).toEqual([]);
	});

	it("without --anonymize the real files are read, over GET", async () => {
		const fake = oldApp();
		await pass(fake, new MemorySink());
		expect(
			fake.requests.filter((r) => r.path.startsWith("/storage/")).map((r) => r.method),
		).toEqual(["GET", "GET"]);
	});
});

describe("real data goes only where the owner said", () => {
	it.each([
		[{ anonymize: false, dryRun: false, env: {} }, false],
		[{ anonymize: false, dryRun: false, env: { SYNC_ALLOW_REAL: "0" } }, false],
		[{ anonymize: false, dryRun: false, env: { SYNC_ALLOW_REAL: "true" } }, false],
		[{ anonymize: false, dryRun: false, env: { SYNC_ALLOW_REAL: "1" } }, true],
		[{ anonymize: true, dryRun: false, env: {} }, true],
		[{ anonymize: false, dryRun: true, env: {} }, true],
	])("%j -> %s", (run, allowed) => {
		expect(realDataAllowed(run)).toBe(allowed);
	});
});
