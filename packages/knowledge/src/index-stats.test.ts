import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLexicalEmbedder } from "./embedder/lexical";
import { createKnowledge } from "./knowledge";
import { SEED } from "./seed/index";
import { type TempDb, tempDb } from "./testing/temp-db";

const embedder = createLexicalEmbedder();
let db: TempDb;
beforeEach(() => {
	db = tempDb();
});
afterEach(() => db.cleanup());

describe("index stats (the control plane's knowledge status)", () => {
	it("lists one brand's indexes with their chunk counts, and nothing of another brand", async () => {
		const k = createKnowledge({ embedder, vector: { kind: "libsql", url: db.url } });
		try {
			expect(await k.indexStats("eqsync")).toEqual([]);
			const report = await k.ingest(SEED);
			const stats = await k.indexStats("eqsync");
			expect(stats.map((s) => s.locale).sort()).toEqual(["en", "ro"]);
			for (const s of stats) {
				expect(s.name).toBe(`kb_eqsync_${s.locale}_${embedder.space}`);
				expect(s.space).toBe(embedder.space);
				const expected = report.indexed
					.filter((e) => e.index === s.name)
					.reduce((n, e) => n + e.chunks, 0);
				expect(s.chunks).toBe(expected);
				expect(s.dimension).toBeGreaterThan(0);
			}
		} finally {
			await k.close();
		}
	});
});
