import { type AssistantSkillType, BUILT_IN_SETTINGS } from "@psi/scheduling-sdk/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatBody, type FakeOpenRouter, type FakeReply, startFakeOpenRouter } from "../../testing";
import { STAFF_EN, STAFF_RO } from "../copy";
import { createStaffEngine, type StaffEngine } from "../engine";
import type { StaffEvent } from "../events";
import { FAKE_NOW, FakeStaffPort, OWNER_PERMISSIONS, staffConfigWith } from "../testing";

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

async function engineWith(replies: ReadonlyArray<FakeReply>): Promise<StaffEngine> {
	fake = await startFakeOpenRouter(replies, {}, { autoSearch: false });
	return createStaffEngine({
		model: { id: "fake/model", apiKey: "k", baseURL: fake.baseURL },
		now: () => FAKE_NOW,
	});
}
async function collect(events: AsyncIterable<StaffEvent>): Promise<Array<StaffEvent>> {
	const out: Array<StaffEvent> = [];
	for await (const e of events) out.push(e);
	return out;
}
const shape = (events: ReadonlyArray<StaffEvent>): Array<string> =>
	events.map((e) => (e.type === "refusal" ? `refusal:${e.reason}` : e.type));
const owner = (): FakeStaffPort => {
	const port = new FakeStaffPort();
	port.permissions = OWNER_PERMISSIONS;
	return port;
};
const Body = z
	.object({
		model: z.string(),
		models: z.array(z.string()).optional(),
		temperature: z.number().optional(),
		max_tokens: z.number().optional(),
		tool_choice: z.unknown().optional(),
		usage: z.object({ include: z.boolean() }).optional(),
		messages: z.array(z.object({ role: z.string(), content: z.unknown() }).passthrough()),
	})
	.passthrough();
const firstBody = () => Body.parse(fake?.requests[0]?.body);
const skill = (over: Partial<AssistantSkillType>): AssistantSkillType => ({
	id: "intake",
	name: "Primire",
	description: "Cum primim un client nou",
	triggers: ["client nou"],
	instructions: "Întreabă întâi de vârstă.",
	surfaces: ["staff"],
	enabled: true,
	...over,
});

describe("a turn runs on the person's configuration", () => {
	it("the model, its fallbacks, temperature and answer length come from it; usage is asked for", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["Bună."] }]);
		const port = owner();
		port.config = staffConfigWith({
			model: { primary: "xiaomi/mimo-v2.6-flash", fallbacks: ["vendor/backup"] },
			temperature: 0.7,
			maxOutputTokens: 1_000,
		});
		expect(shape(await collect(engine.chat(port, { message: "salut" })))).toContain("text");
		const body = firstBody();
		expect(body.model).toBe("xiaomi/mimo-v2.6-flash");
		expect(body.models).toEqual(["xiaomi/mimo-v2.6-flash", "vendor/backup"]);
		expect(body.temperature).toBe(0.7);
		expect(body.max_tokens).toBe(1_000);
		expect(body.usage).toEqual({ include: true });
	});
	it("the stable instructions carry the prompt cache breakpoint; the per-turn notes come after it", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["Bună."] }]);
		await collect(engine.chat(owner(), { message: "salut" }));
		const system = firstBody().messages.filter((m) => m.role === "system");
		// The breakpoint sits on the last block of the stable part (the provider caches up to and including it).
		expect(JSON.stringify(system[0]?.content)).toContain(`"cache_control":{"type":"ephemeral"}`);
		expect(JSON.stringify(system[0]?.content)).toContain(STAFF_EN.prompt.rulesHeading);
		expect(JSON.stringify(system.slice(1).map((m) => m.content))).toContain("2026-11-13");
		expect(JSON.stringify(system.slice(1))).not.toContain("cache_control");
	});
	it("the stable part is the same across two people of one organisation (so the provider's cache serves both)", async () => {
		const engine = await engineWith([
			{ kind: "text", chunks: ["Unu."] },
			{ kind: "text", chunks: ["Doi."] },
		]);
		const ana = owner();
		const dan = owner();
		dan.signIn({ sub: "sub-dan", name: "Dan Pop" });
		await collect(engine.chat(ana, { message: "salut" }));
		await collect(engine.chat(dan, { message: "salut" }));
		const stable = (i: number) =>
			JSON.stringify(Body.parse(fake?.requests[i]?.body).messages[0]?.content);
		expect(stable(0)).toBe(stable(1));
	});
	it("the organisation's override, addition, tone, language and skills reach the instructions", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["Bună."] }]);
		const port = owner();
		port.config = staffConfigWith(
			{
				prompt: { override: "Ești asistentul clinicii X.", append: "Nu folosi emoji." },
				tone: "formal",
				language: "ro",
			},
			{ skills: [skill({})] },
		);
		await collect(engine.chat(port, { message: "salut" }));
		const text = JSON.stringify(firstBody().messages[0]?.content);
		expect(text).toContain("Ești asistentul clinicii X.");
		// The override replaces the voice, never the rules.
		expect(text).not.toContain(STAFF_EN.prompt.language);
		expect(text).toContain(STAFF_EN.prompt.rulesHeading);
		expect(text).toContain("Nu folosi emoji.");
		expect(text).toContain(STAFF_EN.prompt.tone("formal"));
		expect(text).toContain(STAFF_EN.prompt.replyLanguage("ro"));
		expect(text).toContain("Întreabă întâi de vârstă.");
	});
	it("no tool rounds allowed: the model may only answer in words", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["Bună."] }]);
		const port = owner();
		port.config = staffConfigWith({ maxToolCalls: 0 });
		await collect(engine.chat(port, { message: "salut" }));
		expect(firstBody().tool_choice).toBe("none");
	});
	it("a skill with a tool list narrows the turn to it when its trigger appears, and only then", async () => {
		const engine = await engineWith([
			{ kind: "text", chunks: ["Unu."] },
			{ kind: "text", chunks: ["Doi."] },
		]);
		const port = owner();
		port.config = staffConfigWith({}, { skills: [skill({ tools: ["staffFindClient"] })] });
		await collect(engine.chat(port, { message: "avem un client nou" }));
		const narrowed = chatBody(fake?.requests[0]).tools?.map((t) => t.function.name) ?? [];
		expect(narrowed).toContain("staffFindClient");
		expect(narrowed).not.toContain("staffCreateAppointment");
		await collect(engine.chat(port, { message: "ce am azi?", threadId: "t2" }));
		expect(chatBody(fake?.requests[1]).tools?.map((t) => t.function.name)).toContain(
			"staffCreateAppointment",
		);
	});
	it("what the turn used is recorded once, tokens and cost from the provider's accounting", async () => {
		const engine = await engineWith([
			{
				kind: "text",
				chunks: ["Bună."],
				usage: { prompt: 1_200, completion: 80, cached: 900, cost: 0.00042 },
			},
		]);
		const port = owner();
		await collect(engine.chat(port, { message: "salut" }));
		expect(port.usage).toEqual([
			{
				inputTokens: 1_200,
				outputTokens: 80,
				cachedTokens: 900,
				costMicroUsd: 420,
				limitHit: false,
			},
		]);
	});
	it("meters that cannot be reached do not fail the turn", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["Bună."] }]);
		const port = owner();
		port.down.add("recordUsage");
		expect(shape(await collect(engine.chat(port, { message: "salut" })))).toEqual([
			"thinking",
			"text",
			"done",
		]);
	});
});

describe("a limit refuses before any model is asked, in the person's words", () => {
	const cases = [
		["disabled", "disabled"],
		["budget", "budget"],
		["tokens_month", "tokens"],
		["tokens_day", "tokens"],
		["messages_day", "messages_day"],
	] as const;
	it.each(cases)("%s → %s, counted as a limit hit, nothing else written", async (stop, reason) => {
		const engine = await engineWith([{ kind: "text", chunks: ["never"] }]);
		const port = owner();
		port.config = staffConfigWith({}, { stop });
		expect(shape(await collect(engine.chat(port, { message: "salut" })))).toEqual([
			`refusal:${reason}`,
			"done",
		]);
		expect(fake?.requests).toEqual([]);
		expect(port.usage).toEqual([
			{ inputTokens: 0, outputTokens: 0, cachedTokens: 0, costMicroUsd: 0, limitHit: true },
		]);
		expect(port.writes()).toEqual([]);
	});
	it("each refusal has friendly words in Romanian and in English", () => {
		for (const [, reason] of cases) {
			expect(STAFF_RO.panel.refusals[reason].length).toBeGreaterThan(30);
			expect(STAFF_EN.panel.refusals[reason].length).toBeGreaterThan(30);
			expect(STAFF_RO.panel.refusals[reason]).not.toBe(STAFF_EN.panel.refusals[reason]);
		}
		expect(STAFF_RO.panel.refusals.session_limit).toMatch(/conversație nouă/);
	});
	it("a configuration the service cannot give means no turn: unavailable, no model asked", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["never"] }]);
		const port = owner();
		port.down.add("assistant");
		expect(shape(await collect(engine.chat(port, { message: "salut" })))).toEqual([
			"refusal:unavailable",
			"done",
		]);
		expect(fake?.requests).toEqual([]);
	});
	it("a malformed configuration is refused at the boundary like any other answer", async () => {
		const engine = await engineWith([{ kind: "text", chunks: ["never"] }]);
		const port = owner();
		port.config = { ...port.config, settings: { ...BUILT_IN_SETTINGS.staff, maxToolCalls: 999 } };
		expect(shape(await collect(engine.chat(port, { message: "salut" })))).toEqual([
			"refusal:unavailable",
			"done",
		]);
	});
	it("a conversation stops at its length; another conversation goes on", async () => {
		const engine = await engineWith([
			{ kind: "text", chunks: ["Unu."] },
			{ kind: "text", chunks: ["Doi."] },
			{ kind: "text", chunks: ["Trei."] },
		]);
		const port = owner();
		port.config = staffConfigWith({ messages: { perSession: 2, perDay: 400 } });
		expect(shape(await collect(engine.chat(port, { message: "unu", threadId: "a" })))).toContain(
			"text",
		);
		expect(shape(await collect(engine.chat(port, { message: "doi", threadId: "a" })))).toContain(
			"text",
		);
		expect(shape(await collect(engine.chat(port, { message: "trei", threadId: "a" })))).toEqual([
			"refusal:session_limit",
			"done",
		]);
		expect(shape(await collect(engine.chat(port, { message: "unu", threadId: "b" })))).toContain(
			"text",
		);
	});
});
