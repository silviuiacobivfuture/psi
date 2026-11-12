import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createKnowledge,
	createLexicalEmbedder,
	type KnowledgeEntryInput,
	type KnowledgeStore,
} from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IndexPort, type PipelinePorts, runSource, type SourcePatch } from "./ingest-source";
import { type SourceDoc, SourceDocSchema } from "./source-doc";
import { citationUrl, planSourceEntries, sourceOfEntry } from "./source-plan";

const HASH = "h1";
const SECTIONS = [
	{ title: "Program", anchor: "program", text: "TEST: deschis luni-vineri 9-17, sâmbătă închis." },
	{
		title: "Pașii evaluării",
		anchor: "pasii-evaluarii",
		text: "TEST: unu, sunați; doi, veniți la ședință.",
	},
];

function doc(over: Record<string, unknown> = {}): SourceDoc {
	return SourceDocSchema.parse({
		id: 7,
		brand: "eqsync",
		title: "TEST Ghid de program",
		language: "ro",
		sensitivity: "public",
		origin: "file",
		url: "/api/knowledge-sources/file/test.pdf",
		sections: SECTIONS,
		contentHash: HASH,
		approval: {
			state: "approved",
			hash: HASH,
			by: "1",
			byName: "Ana",
			at: "2026-11-12T00:00:00.000Z",
		},
		...over,
	});
}

describe("the ingestion cycle", () => {
	let dir: string;
	let kb: KnowledgeStore;
	let stored: SourceDoc;
	let ingests: number;
	let failSemantic: boolean;
	const saves: SourcePatch[] = [];

	const port = (): IndexPort => ({
		primarySpace: () => (failSemantic ? "semantic_space" : kb.embedder.space),
		async ingest(entries: ReadonlyArray<KnowledgeEntryInput>) {
			ingests += 1;
			if (failSemantic) {
				const report = await kb.ingest(entries);
				return {
					report,
					lexical: true,
					embedder: "lexical",
					space: kb.embedder.space,
					fallback: "Error: 503",
				};
			}
			const report = await kb.ingest(entries);
			return { report, lexical: false, embedder: "test", space: kb.embedder.space, fallback: null };
		},
		remove: (ids) => kb.remove(ids),
	});
	const ports = (): PipelinePorts => ({
		load: async () => stored,
		async save(_id, patch) {
			saves.push(patch);
			stored = SourceDocSchema.parse({ ...stored, ...patch });
		},
		index: async () => port(),
		serverUrl: "https://cms.example",
		now: () => new Date("2026-11-12T10:00:00Z"),
	});
	const ids = async (): Promise<string[]> => (await kb.stored("eqsync")).map((s) => s.entry.id);

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "ks-"));
		kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
		ingests = 0;
		failSemantic = false;
		saves.length = 0;
		stored = doc();
	});
	afterEach(async () => {
		await kb.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it("indexes an approved public source: one entry per section, cited by source id and anchor", async () => {
		const out = await runSource(ports(), "7");
		expect(out).toMatchObject({ kind: "indexed", lexical: false, entries: 2 });
		expect(await ids()).toEqual(["cms.ks.7.000", "cms.ks.7.001"]);
		expect(stored.status).toBe("indexed");
		expect(saves.map((s) => s.status).filter(Boolean)).toEqual(["chunked", "embedding", "indexed"]);
		const hits = await kb.search({ query: "sâmbătă închis", brand: "eqsync", locale: "ro" });
		expect(hits[0]?.source).toMatchObject({
			id: "cms.ks.7.000",
			title: "TEST Ghid de program — Program",
			url: "cite:ks-7#program",
		});
		expect(sourceOfEntry("cms.ks.7.001")).toBe("7");
	});

	it("is idempotent: the same content again writes nothing; a forced re-index rewrites", async () => {
		await runSource(ports(), "7");
		saves.length = 0;
		expect(await runSource(ports(), "7")).toEqual({ kind: "unchanged" });
		expect(ingests).toBe(1);
		expect(saves).toEqual([]);
		expect((await runSource(ports(), "7", { force: true })).kind).toBe("indexed");
		expect(ingests).toBe(2);
	});

	it("a changed file replaces its chunks: sections that are gone leave the index", async () => {
		await runSource(ports(), "7");
		const first = SECTIONS[0];
		if (first === undefined) throw new Error("fixture");
		stored = SourceDocSchema.parse({
			...stored,
			sections: [{ ...first, text: "TEST: acum deschis și duminică." }],
			contentHash: "h2",
			approval: { ...stored.approval, hash: "h2" },
		});
		await runSource(ports(), "7");
		expect(await ids()).toEqual(["cms.ks.7.000"]);
		expect(await kb.search({ query: "ședință", brand: "eqsync", locale: "ro" })).toEqual([]);
		expect((await kb.search({ query: "duminică", brand: "eqsync", locale: "ro" })).length).toBe(1);
	});

	it("never indexes a non-public source, and removes one that becomes private", async () => {
		stored = doc({ sensitivity: "internal" });
		expect(await runSource(ports(), "7")).toEqual({ kind: "not_indexed", status: "private" });
		expect(ingests).toBe(0);
		stored = doc();
		await runSource(ports(), "7");
		stored = SourceDocSchema.parse({ ...stored, sensitivity: "confidential" });
		await runSource(ports(), "7");
		expect(await ids()).toEqual([]);
		expect(stored).toMatchObject({ status: "private", indexedIds: [], chunks: 0 });
	});

	it("waits for approval of the current content: a new file's hash is not the approved one", async () => {
		stored = doc({ approval: { state: "pending" } });
		expect(await runSource(ports(), "7")).toEqual({
			kind: "not_indexed",
			status: "awaiting_approval",
		});
		stored = doc({ contentHash: "h2" });
		expect(await runSource(ports(), "7")).toEqual({
			kind: "not_indexed",
			status: "awaiting_approval",
		});
		stored = doc({ approval: { state: "rejected", hash: HASH } });
		expect(await runSource(ports(), "7")).toEqual({ kind: "not_indexed", status: "rejected" });
		expect(ingests).toBe(0);
	});

	it("'Remove from index' takes every chunk out", async () => {
		await runSource(ports(), "7");
		stored = SourceDocSchema.parse({ ...stored, inIndex: false });
		expect(await runSource(ports(), "7")).toEqual({ kind: "not_indexed", status: "removed" });
		expect(await ids()).toEqual([]);
	});

	it("marks a fall-back run 'indexed (lexical)' and never counts it as done", async () => {
		failSemantic = true;
		expect(await runSource(ports(), "7")).toMatchObject({ kind: "indexed", lexical: true });
		expect(stored).toMatchObject({
			status: "indexed_lexical",
			error: "Error: 503",
			indexedFingerprint: null,
		});
		expect((await runSource(ports(), "7")).kind).toBe("indexed");
		expect(ingests).toBe(2);
	});

	it("a clinical source needs the reviewer's stamp; without one it fails, and nothing stays", async () => {
		stored = doc({
			kind: "clinical",
			approval: { state: "approved", hash: HASH, byName: null, at: null },
		});
		const out = await runSource(ports(), "7");
		expect(out).toEqual({ kind: "failed", error: "not retrievable: clinical-unreviewed" });
		expect(await ids()).toEqual([]);
	});

	it("an index failure is the source's error, never a throw", async () => {
		const broken: PipelinePorts = {
			...ports(),
			index: async () => Promise.reject(new Error("store down")),
		};
		expect(await runSource(broken, "7")).toEqual({ kind: "failed", error: "Error: store down" });
		expect(stored).toMatchObject({ status: "failed", error: "Error: store down" });
	});
});

describe("citations", () => {
	it("links the file only when public-downloadable; a PDF page anchor is kept", () => {
		expect(citationUrl(doc(), "page=2", "https://cms.example")).toBe("cite:ks-7#page=2");
		expect(citationUrl(doc({ downloadable: true }), "page=2", "https://cms.example")).toBe(
			"https://cms.example/api/knowledge-sources/file/test.pdf#page=2",
		);
		expect(
			citationUrl(
				doc({ downloadable: true, origin: "url", sourceUrl: "https://psizone.ro/program" }),
				"program",
				"https://cms.example",
			),
		).toBe("https://psizone.ro/program");
	});

	it("stamps the reviewer where the clinical rule applies (every Psizone source)", () => {
		const [p] = planSourceEntries(doc({ brand: "psizone" }), "https://cms.example");
		expect(p).toMatchObject({ reviewedBy: "Ana", reviewedAt: "2026-11-12" });
		const [e] = planSourceEntries(doc(), "https://cms.example");
		expect(e).toMatchObject({ reviewedBy: null, reviewedAt: null });
	});
});
