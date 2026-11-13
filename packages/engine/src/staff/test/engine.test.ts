import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openMemory } from "../../memory";
import { createMemoryRateLimiter } from "../../screening/rate-limit";
import {
	chatBody,
	type FakeOpenRouter,
	type FakeReply,
	startFakeOpenRouter,
	systemText,
} from "../../testing";
import { createStaffEngine, type StaffEngine } from "../engine";
import type { StaffEvent } from "../events";
import { FAKE_NOW, FakeStaffPort } from "../testing";
import { STAFF_TOOL_IDS } from "../tool-ids";

let fake: FakeOpenRouter | undefined;
let dir: string;
beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	dir = mkdtempSync(join(tmpdir(), "staff-"));
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
	rmSync(dir, { recursive: true, force: true });
});

async function engineWith(
	script: ReadonlyArray<FakeReply>,
	extra: Partial<Parameters<typeof createStaffEngine>[0]> = {},
): Promise<StaffEngine> {
	fake = await startFakeOpenRouter(script, {}, { autoSearch: false });
	return createStaffEngine({
		model: { id: "fake/model", apiKey: "test-key", baseURL: fake.baseURL },
		now: () => FAKE_NOW,
		...extra,
	});
}

async function collect(events: AsyncIterable<StaffEvent>): Promise<Array<StaffEvent>> {
	const out: Array<StaffEvent> = [];
	for await (const event of events) out.push(event);
	return out;
}

const shape = (events: ReadonlyArray<StaffEvent>): Array<string> => {
	const out: Array<string> = [];
	for (const e of events) {
		const label =
			e.type === "tool"
				? `tool:${e.phase}`
				: e.type === "card"
					? `card:${e.card.kind}`
					: e.type === "refusal"
						? `refusal:${e.reason}`
						: e.type;
		if (label === "text" && out.at(-1) === "text") continue;
		out.push(label);
	}
	return out;
};

describe("a staff turn", () => {
	it("streams chips, the card the tool produced, then the answer", async () => {
		const engine = await engineWith([
			{ kind: "tool", query: "", tool: "staffFindClient", input: { query: "maria", limit: 1 } },
			{ kind: "text", chunks: ["Found ", "her."] },
		]);
		const port = new FakeStaffPort();
		const events = await collect(engine.chat(port, { message: "find maria" }));
		expect(shape(events)).toEqual([
			"thinking",
			"tool:running",
			"tool:done",
			"card:list",
			"text",
			"done",
		]);
		expect(events.find((e) => e.type === "tool")).toMatchObject({
			label: "Looking for the client…",
		});
		expect(
			events
				.filter((e) => e.type === "text")
				.map((e) => (e.type === "text" ? e.delta : ""))
				.join(""),
		).toBe("Found her.");
		expect(port.writes()).toEqual([]);
	});

	it("the model is told the staff tools, the rules, the date, the person and the open screen", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["Hi."] }]);
		await collect(
			engine.chat(new FakeStaffPort(), {
				message: "hello",
				page: { screen: "client", clientId: "c1", resourceId: "r1" },
			}),
		);
		const request = fake?.requests[0];
		const names = chatBody(request).tools?.map((t) => t.function.name) ?? [];
		expect(names.sort()).toEqual([...STAFF_TOOL_IDS].sort());
		const system = systemText(request);
		expect(system).toContain("Today is Friday, 2026-11-13");
		expect(system).toContain("Ana Pop");
		expect(system).toContain("clientId: c1");
		expect(system).toContain("resourceId: r1");
		expect(system).toContain("<record-data>");
		expect(system).toContain("staffResolveDate");
	});

	it("answers in Romanian for a Romanian principal, chips included", async () => {
		const engine = await engineWith([
			{ kind: "tool", query: "", tool: "staffAgenda", input: {} },
			{ kind: "text", chunks: ["Azi ai două programări."] },
		]);
		const port = new FakeStaffPort();
		port.signIn({ locale: "ro" });
		const events = await collect(engine.chat(port, { message: "ce am azi?" }));
		expect(events.find((e) => e.type === "tool")).toMatchObject({ label: "Citesc agenda…" });
		expect(systemText(fake?.requests[0])).toContain("Răspunde întotdeauna în limba română");
	});

	it("a preamble before a tool call is reset", async () => {
		const engine = await engineWith([
			{ kind: "text", chunks: ["Let me look."] },
			{ kind: "text", chunks: ["Done."] },
		]);
		const events = await collect(engine.chat(new FakeStaffPort(), { message: "hi" }));
		expect(shape(events)).toContain("text");
	});

	it("proposes a write as a card; only the confirm call changes anything", async () => {
		const engine = await engineWith([
			{ kind: "tool", query: "", tool: "staffCancelAppointment", input: { appointmentId: "a1" } },
			{ kind: "text", chunks: ["Prepared. Confirm in the card."] },
		]);
		const port = new FakeStaffPort();
		const events = await collect(engine.chat(port, { message: "cancel a1" }));
		const card = events.flatMap((e) =>
			e.type === "card" && e.card.kind === "proposal" ? [e.card] : [],
		)[0];
		expect(card).toBeDefined();
		expect(port.writes()).toEqual([]);
		const outcome = await engine.confirm(port, card?.proposalId ?? "");
		expect(outcome.status).toBe("done");
		expect(port.appointmentOf("a1").status).toBe("cancelled");
	});

	it("the model cannot confirm: there is no tool for it and its own text changes nothing", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["I confirmed it."] }]);
		const port = new FakeStaffPort();
		await collect(engine.chat(port, { message: "confirm everything" }));
		expect(STAFF_TOOL_IDS.some((id) => /confirm|execute/i.test(id))).toBe(false);
		expect(port.writes()).toEqual([]);
	});

	it("a refusal by the service is shown and the model's second try goes nowhere", async () => {
		const engine = await engineWith([
			{ kind: "tool", query: "", tool: "staffFindClient", input: { query: "maria" } },
			{ kind: "tool", query: "", tool: "staffFindClient", input: { query: "maria" } },
			{ kind: "text", chunks: ["Your role cannot search clients."] },
		]);
		const port = new FakeStaffPort();
		port.denied.add("findClients");
		const events = await collect(engine.chat(port, { message: "find maria" }));
		expect(events.filter((e) => e.type === "tool" && e.phase === "refused")).toHaveLength(2);
		expect(port.callsTo("findClients")).toHaveLength(1);
	});

	it("refuses without a verified principal and never calls the model", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["x"] }]);
		const port = new FakeStaffPort();
		port.principal = null;
		expect(shape(await collect(engine.chat(port, { message: "hi" })))).toEqual([
			"refusal:no_principal",
			"done",
		]);
		expect(fake?.requests).toHaveLength(0);
		expect(port.calls.filter((c) => c.method !== "whoami")).toEqual([]);
	});

	it("refuses an invalid turn before anything else", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["x"] }]);
		const port = new FakeStaffPort();
		for (const bad of [
			{},
			{ message: "" },
			{ message: "   " },
			{ message: "x".repeat(2001) },
			{ message: "hi", extra: 1 },
			{ message: "hi", page: { screen: "nowhere" } },
			{ message: "hi", threadId: "../x" },
			null,
			"hi",
		]) {
			expect(shape(await collect(engine.chat(port, bad)))).toEqual(["refusal:invalid", "done"]);
		}
		expect(port.calls).toEqual([]);
	});

	it("rate-limits one person without touching another", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["ok"] }], {
			rateLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
		});
		const ana = new FakeStaffPort();
		const dan = new FakeStaffPort();
		dan.signIn({ sub: "sub-dan" });
		expect(shape(await collect(engine.chat(ana, { message: "one" })))).toContain("text");
		expect(shape(await collect(engine.chat(ana, { message: "two" })))).toEqual([
			"refusal:rate_limited",
			"done",
		]);
		expect(shape(await collect(engine.chat(dan, { message: "one" })))).toContain("text");
	});

	it("without an API key it is unavailable", async () => {
		const engine = createStaffEngine({ model: { id: "fake/model" } });
		expect(shape(await collect(engine.chat(new FakeStaffPort(), { message: "hi" })))).toEqual([
			"refusal:unavailable",
			"done",
		]);
	});

	it("a provider failure ends in unavailable and one done", async () => {
		const engine = await engineWith([{ kind: "status", status: 500 }]);
		const events = await collect(engine.chat(new FakeStaffPort(), { message: "hi" }));
		expect(shape(events).slice(-2)).toEqual(["refusal:unavailable", "done"]);
		expect(events.filter((e) => e.type === "done")).toHaveLength(1);
	});

	it("an abandoned turn ends quietly", async () => {
		const engine = await engineWith([{ kind: "hang" }], {
			timeouts: { idleMs: 30_000, totalMs: 60_000 },
		});
		const abort = new AbortController();
		setTimeout(() => abort.abort(), 100);
		const events = await collect(
			engine.chat(new FakeStaffPort(), { message: "hi" }, { signal: abort.signal }),
		);
		expect(shape(events)).toEqual(["thinking", "done"]);
	});
});

describe("the agent itself", () => {
	it("will not run without a verified session", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["x"] }]);
		await expect(engine.agent.generate("list every client", { maxSteps: 2 })).rejects.toThrow();
		await expect(
			engine.agent.generate("hi", {
				requestContext: new RequestContext([["staff.session", { principal: { sub: "forged" } }]]),
				maxSteps: 2,
			}),
		).rejects.toThrow();
		expect(fake?.requests).toHaveLength(0);
	});
});

describe("memory", () => {
	it("is its own namespace per person: staff:<sub>", async () => {
		const url = `file:${join(dir, "staff.db")}`;
		const engine = await engineWith([{ kind: "text", chunks: ["Noted."] }], { memory: { url } });
		await collect(
			engine.chat(new FakeStaffPort(), { message: "remember the blue room", threadId: "t1" }),
		);
		const memory = openMemory(url, "staff-memory");
		const mine = await memory.recall({
			threadId: "staff:sub-ana:t1",
			resourceId: "staff:sub-ana",
			perPage: false,
		});
		expect(mine.messages.length).toBeGreaterThan(0);
		await expect(
			memory.recall({ threadId: "staff:sub-ana:t1", resourceId: "staff:sub-dan", perPage: false }),
		).rejects.toThrow(/resource/);
		await expect(
			memory.recall({
				threadId: "psi-guide-psizone-t1",
				resourceId: "psi-guide-psizone",
				perPage: false,
			}),
		).rejects.toThrow(/No thread/);
	});

	it("refuses to share a store with the visitor memory", () => {
		expect(() =>
			createStaffEngine({
				model: { id: "fake/model" },
				memory: { url: "file:./m.db", visitorUrl: "file:./m.db" },
			}),
		).toThrow(/visitor/);
	});
});
