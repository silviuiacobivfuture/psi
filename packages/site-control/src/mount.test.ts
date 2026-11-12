import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAccount, memoryStores } from "@psi/account";
import { createControlClient } from "@psi/cms-client";
import { createGuide } from "@psi/guide";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore, SEED } from "@psi/knowledge";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countingGuide } from "./guide-port";
import { mountSiteControl } from "./mount";

const SECRET = "c".repeat(40);
const words = () => ({ group: "Echipa", label: "Administrare", hint: "Panoul de control" });
let dir: string;
let kb: KnowledgeStore;

beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	vi.stubEnv("CHROMA_URL", "");
	dir = mkdtempSync(join(tmpdir(), "psi-site-control-"));
	kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await kb.close();
	rmSync(dir, { recursive: true, force: true });
});

function site(env: Record<string, string> = { PSI_CONTROL_SECRET: SECRET }) {
	const app = new Hono();
	const guide = countingGuide(createGuide({ brand: "eqsync", knowledge: kb }));
	const stores = memoryStores();
	const account = createAccount({
		site: { slug: "eqsync-web", key: "eqsync", origin: "http://localhost:4320" },
		env: {},
		stores,
	});
	mountSiteControl(app, {
		brand: "eqsync",
		env,
		guide,
		account,
		scheduling: { state: "not_configured" },
		staffLink: words,
	});
	const client = createControlClient({
		origin: "http://localhost:4320",
		secret: SECRET,
		fetch: async (input, init) => app.request(String(input), init),
	});
	return { app, client, stores, guide };
}

describe("a site's control routes, through the CMS's client", () => {
	it("report the guide, an empty knowledge base and the parts not configured", async () => {
		const r = await site().client.status("3");
		if (!r.ok) throw new Error(r.problem);
		expect(r.data.brand).toBe("eqsync");
		expect(r.data.guide).toMatchObject({ state: "on", hasKey: false, today: { asked: 0 } });
		expect(r.data.knowledge).toMatchObject({ state: "on", indexes: [], lastIngest: null });
		expect(r.data.knowledge.embedder?.kind).toBe("lexical");
		expect(r.data.scheduling.state).toBe("not_configured");
		expect(r.data.push.state).toBe("not_configured");
	});
	it("rebuild the brand's index with the seed, and the status follows", async () => {
		const { client } = site();
		const out = await client.ingest({ entries: [], remove: [], includeSeed: true }, "3");
		if (!out.ok || !out.data.ok) throw new Error("ingest failed");
		expect(out.data.workflow).toBe("ingestKnowledge");
		expect(out.data.indexed).toBeGreaterThan(0);
		const s = await client.status("3");
		if (!s.ok) throw new Error(s.problem);
		expect(s.data.knowledge.indexes.reduce((n, i) => n + i.chunks, 0)).toBe(out.data.chunks);
		expect(s.data.knowledge.lastIngest).toMatchObject({ actor: "3", chunks: out.data.chunks });
	});
	it("never ingests another brand's entry handed to it", async () => {
		const { client } = site();
		const out = await client.ingest(
			{ entries: [{ id: "x", brand: "psizone" }], remove: [], includeSeed: false },
			"3",
		);
		expect(out).toEqual({ ok: true, data: { ok: false, reason: "nothing to ingest" } });
	});
	it("find an account by e-mail without its conversations' text", async () => {
		const { client, stores } = site();
		await stores.accounts.signedIn(
			{ issuer: "i", subject: "s-1", email: "ana@psi.test", name: "Ana" },
			1,
		);
		await stores.conversations.append("s-1", "eqsync", {
			question: "secret q",
			answer: "a",
			at: 2,
		});
		const hits = await client.searchAccounts("ANA@psi.test", "3");
		expect(hits.ok && hits.data.map((h) => h.subject)).toEqual(["s-1"]);
		const p = await client.person("s-1", "3");
		if (!p.ok) throw new Error(p.problem);
		expect(p.data.conversations).toBe(1);
		expect(JSON.stringify(p.data)).not.toContain("secret q");
		expect(p.data.reservations).toBe("not_applicable");
		const erased = await client.erase("s-1", "3");
		expect(erased).toEqual({ ok: true, data: { ok: true, sessionsEnded: 0 } });
		expect(await stores.accounts.get("s-1")).toBeNull();
	});
	it("answer nothing without the secret, and send /admin to the control plane", async () => {
		const { app, client } = site({});
		expect(await client.status("3")).toEqual({ ok: false, problem: "not_configured" });
		for (const path of ["/admin", "/en/admin"]) {
			const r = await app.request(path);
			expect(r.status).toBe(302);
			expect(r.headers.get("location")).toBe("http://localhost:4350/admin/platform?brand=eqsync");
		}
	});
	it("show the Compass's staff link to no one who is not signed in", async () => {
		const r = await site().app.request("/__admin/compass");
		expect(r.status).toBe(204);
		expect(r.headers.get("cache-control")).toBe("private, no-store");
	});
	it("count a visitor's question, never the staff's test question", async () => {
		const { client, guide } = site();
		for await (const _ of guide.ask({ question: "Ce este EQ-SYNC?", locale: "ro" })) {
			// A visitor's answer, consumed.
		}
		const test = await client.ask({ question: "Ce este EQ-SYNC?", locale: "ro" }, "3");
		if (!test.ok) throw new Error(test.problem);
		for await (const _ of test.data) {
			// The staff's test answer, consumed.
		}
		const s = await client.status("3");
		expect(s.ok && s.data.guide.today.asked).toBe(1);
	});
	it("drop what is no longer published before re-ingesting the rest", async () => {
		const { client } = site();
		const first = await client.ingest({ entries: [], remove: [], includeSeed: true }, "3");
		if (!first.ok || !first.data.ok) throw new Error("ingest failed");
		const before = await client.status("3");
		const chunksBefore = before.ok
			? before.data.knowledge.indexes.reduce((n, i) => n + i.chunks, 0)
			: 0;
		const gone = SEED.find((e) => e.brand === "eqsync")?.id ?? "";
		const only = await client.ingest({ entries: [], remove: [gone], includeSeed: false }, "3");
		expect(only.ok && only.data.ok && only.data.removed).toBe(1);
		const after = await client.status("3");
		const chunksAfter = after.ok
			? after.data.knowledge.indexes.reduce((n, i) => n + i.chunks, 0)
			: 0;
		expect(chunksAfter).toBeLessThan(chunksBefore);
	});
});
