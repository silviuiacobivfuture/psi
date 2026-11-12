import { describe, expect, it } from "vitest";
import { createControlClient } from "./client";
import type { SiteStatus, TestAnswerLine } from "./contract";
import { type ControlPorts, handleControl } from "./handler";
import { CONTROL_ACTOR_HEADER, signControl } from "./signing";

const SECRET = "s".repeat(40);
const status: SiteStatus = {
	brand: "psizone",
	startedAt: "2026-11-12T00:00:00.000Z",
	guide: {
		state: "on",
		model: "m/x",
		hasKey: true,
		screeningLevel: "standard",
		today: { asked: 2, unanswered: 1 },
	},
	knowledge: {
		state: "on",
		store: "chroma (x)",
		embedder: { kind: "lexical", model: "lexical" },
		indexes: [],
		lastIngest: null,
	},
	scheduling: { state: "not_configured" },
	accounts: { state: "on", storage: "memory", missing: [] },
	push: { state: "off", storage: null, reason: "no keys" },
};

function site(ports: Partial<ControlPorts>, secret: string | null = SECRET) {
	const audit: string[] = [];
	const all: ControlPorts = {
		brand: "psizone",
		status: async () => status,
		onAudit: (e) => audit.push(`${e.actor} ${e.route} ${e.status}`),
		...ports,
	};
	const fetcher: typeof fetch = async (input, init) =>
		handleControl(new Request(String(input), init), secret, all);
	return {
		audit,
		client: createControlClient({ origin: "http://site.test", secret: SECRET, fetch: fetcher }),
	};
}

describe("the control contract, CMS client against the site's handler", () => {
	it("answers the status, and logs who asked", async () => {
		const { client, audit } = site({});
		expect(await client.status("7")).toEqual({ ok: true, data: status });
		expect(audit).toEqual(["7 /__control/status 200"]);
	});
	it("says not_configured for a part the site does not have, and never crashes", async () => {
		const { client } = site({});
		expect(await client.agent("7")).toEqual({ ok: false, problem: "not_configured" });
		expect(await client.push("7")).toEqual({ ok: false, problem: "not_configured" });
		expect(await client.searchAccounts("a@b.ro", "7")).toEqual({
			ok: false,
			problem: "not_configured",
		});
	});
	it("is off (not configured) on a site without the secret", async () => {
		const { client } = site({}, null);
		expect(await client.status("7")).toEqual({ ok: false, problem: "not_configured" });
	});
	it("refuses another secret, a stale request and a moved one", async () => {
		const handler = (r: Request) =>
			handleControl(r, SECRET, { brand: "psizone", status: async () => status });
		const wrong = signControl({
			method: "GET",
			path: "/__control/status",
			actor: "1",
			secret: "x".repeat(40),
		});
		expect(
			(await handler(new Request("http://s/__control/status", { headers: wrong.headers }))).status,
		).toBe(401);
		const old = signControl({
			method: "GET",
			path: "/__control/status",
			actor: "1",
			secret: SECRET,
			now: () => Date.now() - 600_000,
		});
		expect(
			(await handler(new Request("http://s/__control/status", { headers: old.headers }))).status,
		).toBe(401);
		const moved = signControl({
			method: "GET",
			path: "/__control/guide",
			actor: "1",
			secret: SECRET,
		});
		expect(
			(await handler(new Request("http://s/__control/status", { headers: moved.headers }))).status,
		).toBe(401);
		const ok = signControl({
			method: "GET",
			path: "/__control/status",
			actor: "1",
			secret: SECRET,
		});
		expect(
			(await handler(new Request("http://s/__control/status", { headers: ok.headers }))).status,
		).toBe(200);
		const reattributed = { ...ok.headers, [CONTROL_ACTOR_HEADER]: "2" };
		expect(
			(await handler(new Request("http://s/__control/status", { headers: reattributed }))).status,
		).toBe(401);
	});
	it("streams a test answer line by line, then done", async () => {
		const lines: TestAnswerLine[] = [
			{ type: "text", text: "Bună " },
			{ type: "text", text: "ziua." },
			{ type: "sources", sources: [{ title: "Autism", url: "/copii/autism" }] },
		];
		const { client } = site({
			guide: {
				agent: async () => {
					throw new Error("unused");
				},
				ingest: async () => ({ ok: false, reason: "unused" }),
				async *ask(q) {
					expect(q.question).toBe("Ce este ABA?");
					yield* lines;
				},
			},
		});
		const r = await client.ask({ question: "Ce este ABA?", locale: "ro" }, "7");
		if (!r.ok) throw new Error(r.problem);
		const got: TestAnswerLine[] = [];
		for await (const l of r.data) got.push(l);
		expect(got).toEqual([...lines, { type: "done" }]);
	});
	it("refuses a malformed body before it reaches a port", async () => {
		const { client } = site({
			accounts: {
				search: async () => {
					throw new Error("must not be called");
				},
				person: async () => null,
				export: async () => null,
				erase: async () => ({ ok: false, reason: "not_found" }),
			},
		});
		expect(await client.searchAccounts("not-an-email", "7")).toEqual({
			ok: false,
			problem: "invalid",
		});
		expect(await client.person("nobody", "7")).toEqual({ ok: false, problem: "not_found" });
	});
	it("hides a port's failure behind a bare 500", async () => {
		const { client } = site({
			push: {
				stats: async () => {
					throw new Error("db down: secret");
				},
				test: async () => ({ recipients: 0, sent: 0, failed: 0 }),
			},
		});
		expect(await client.push("7")).toEqual({ ok: false, problem: "invalid" });
	});
});
