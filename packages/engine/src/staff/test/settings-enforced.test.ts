import { BUILT_IN_SETTINGS } from "@psi/scheduling-sdk/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FakeReply } from "../../testing";
import type { StaffTranscript } from "../chat";
import { STAFF_EN, STAFF_RO } from "../copy";
import { FakeStaffPort, OWNER_PERMISSIONS, staffConfigWith } from "../testing";
import { collect, type Harness, startEngine, textOf } from "./turn-harness";

let h: Harness | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await h?.close();
	h = undefined;
});

const Body = z
	.object({ max_tokens: z.number().optional(), tool_choice: z.unknown().optional() })
	.passthrough();
const bodies = () => (h?.fake.requests ?? []).map((r) => Body.parse(r.body));
const owner = (): FakeStaffPort => {
	const port = new FakeStaffPort();
	port.permissions = OWNER_PERMISSIONS;
	return port;
};
const search = (usage?: { prompt: number; completion: number }): FakeReply => ({
	kind: "tool",
	query: "",
	tool: "staffFindClient",
	input: { query: "Ana" },
	...(usage === undefined ? {} : { usage }),
});
const S = BUILT_IN_SETTINGS.staff;

describe("tokens per request", () => {
	it("caps every call's answer: the lower of the answer length and the tokens per request holds", async () => {
		h = await startEngine([{ kind: "text", chunks: ["Bună."] }]);
		const port = owner();
		port.config = staffConfigWith({
			maxOutputTokens: 4_000,
			tokens: { ...S.tokens, perRequest: 2_000 },
		});
		await collect(h.engine.chat(port, { message: "salut" }));
		expect(bodies()[0]?.max_tokens).toBe(2_000);
		await h.close();
		h = await startEngine([{ kind: "text", chunks: ["Bună."] }]);
		const wide = owner();
		wide.config = staffConfigWith({
			maxOutputTokens: 1_500,
			tokens: { ...S.tokens, perRequest: 9_000 },
		});
		await collect(h.engine.chat(wide, { message: "salut" }));
		expect(bodies()[0]?.max_tokens).toBe(1_500);
	});
	it("a turn that reached it calls no more tools: the next step may only answer", async () => {
		h = await startEngine([
			search({ prompt: 1_500, completion: 100 }),
			{ kind: "text", chunks: ["Am găsit-o."] },
		]);
		const port = owner();
		port.config = staffConfigWith({ maxToolCalls: 8, tokens: { ...S.tokens, perRequest: 1_600 } });
		const events = await collect(h.engine.chat(port, { message: "caută Ana" }));
		expect(textOf(events)).toBe("Am găsit-o.");
		const [first, second] = bodies();
		expect(first?.tool_choice).not.toBe("none");
		expect(second?.tool_choice).toBe("none");
	});
	it("below it, the next step still chooses its tools", async () => {
		h = await startEngine([
			search({ prompt: 1_400, completion: 100 }),
			{ kind: "text", chunks: ["Gata."] },
		]);
		const port = owner();
		port.config = staffConfigWith({ maxToolCalls: 8, tokens: { ...S.tokens, perRequest: 1_501 } });
		await collect(h.engine.chat(port, { message: "caută Ana" }));
		expect(bodies()[1]?.tool_choice).not.toBe("none");
	});
});

describe("handing over to a person", () => {
	// The provider fails every call: each turn ends refused as unavailable.
	const refusedTwice = (): Array<FakeReply> => [{ kind: "status", status: 500 }];
	const handoffOn = (afterRefusals: number, contact?: string) =>
		staffConfigWith({
			handoff: { enabled: true, afterRefusals, ...(contact === undefined ? {} : { contact }) },
		});
	let sent = 0;
	const unavailable = async (port: FakeStaffPort, threadId = "t1") => {
		if (h === undefined) throw new Error("no engine");
		sent += 1;
		const events = await collect(h.engine.chat(port, { message: `salut ${sent}`, threadId }));
		expect(events.filter((e) => e.type === "refusal")).toEqual([
			{ type: "refusal", reason: "unavailable" },
		]);
		return events;
	};

	it("at the number of refusals it names the contact, once per conversation, in the person's language", async () => {
		h = await startEngine(refusedTwice());
		const port = owner();
		port.signIn({ locale: "ro" });
		port.config = handoffOn(2, "recepție, 0722 000 000");
		const first = await unavailable(port);
		expect(textOf(first)).toBe("");
		const second = await unavailable(port);
		expect(textOf(second)).toBe(STAFF_RO.handoff("recepție, 0722 000 000"));
		expect(second.at(-1)).toEqual({ type: "done" });
		const third = await unavailable(port);
		expect(textOf(third)).toBe("");
	});
	it("without a contact it names the Owner or an Admin; another conversation counts on its own", async () => {
		h = await startEngine(refusedTwice());
		const port = owner();
		port.config = handoffOn(1);
		expect(textOf(await unavailable(port, "a"))).toBe(STAFF_EN.handoff(undefined));
		expect(STAFF_EN.handoff(undefined)).toMatch(/Owner or an Admin/);
		expect(textOf(await unavailable(port, "b"))).toBe(STAFF_EN.handoff(undefined));
	});
	it("switched off, it is never offered", async () => {
		h = await startEngine(refusedTwice());
		const port = owner();
		port.config = staffConfigWith({ handoff: { enabled: false, afterRefusals: 1, contact: "x" } });
		for (let i = 0; i < 3; i += 1) expect(textOf(await unavailable(port))).toBe("");
	});
	it("a refused tool counts; a turn without refusals adds nothing", async () => {
		h = await startEngine([
			{ kind: "text", chunks: ["Bună."] },
			search(),
			{ kind: "text", chunks: ["Nu am putut căuta."] },
		]);
		const port = owner();
		port.denied.add("findClients");
		port.config = handoffOn(1, "Ana");
		expect(textOf(await collect(h.engine.chat(port, { message: "salut", threadId: "x" })))).toBe(
			"Bună.",
		);
		const refused = await collect(h.engine.chat(port, { message: "caută Ana", threadId: "x" }));
		expect(refused.some((e) => e.type === "tool" && e.phase === "refused")).toBe(true);
		expect(textOf(refused)).toBe(`Nu am putut căuta.\n\n${STAFF_EN.handoff("Ana")}`);
	});
	it("the words exist in both languages and differ", () => {
		expect(STAFF_RO.handoff("X")).toContain("X");
		expect(STAFF_EN.handoff("X")).toContain("X");
		expect(STAFF_RO.handoff(undefined)).not.toBe(STAFF_EN.handoff(undefined));
	});
});

describe("what is logged", () => {
	it("transcripts: on, one per finished turn, redacted; off, none", async () => {
		const seen: Array<StaffTranscript> = [];
		h = await startEngine(
			[
				{ kind: "text", chunks: ["Scrie la ana@exemplu.ro sau 0722 123 456."] },
				{ kind: "text", chunks: ["Bine."] },
			],
			{ onTranscript: (t) => seen.push(t) },
		);
		const port = owner();
		port.config = staffConfigWith({ logging: { redactPii: true, keepTranscripts: true } });
		await collect(
			h.engine.chat(port, { message: "CNP 1960101123456, mail ion@x.ro", threadId: "t" }),
		);
		expect(seen).toHaveLength(1);
		const [one] = seen;
		expect(one?.threadId).toBe("t");
		expect(one?.question).not.toContain("1960101123456");
		expect(one?.question).not.toContain("ion@x.ro");
		expect(one?.answer).not.toContain("ana@exemplu.ro");
		expect(one?.answer).not.toContain("0722 123 456");
		port.config = staffConfigWith({ logging: { redactPii: true, keepTranscripts: false } });
		await collect(h.engine.chat(port, { message: "altceva", threadId: "t" }));
		expect(seen).toHaveLength(1);
	});
	it("transcripts kept unredacted only when the organisation switched redaction off", async () => {
		const seen: Array<StaffTranscript> = [];
		h = await startEngine([{ kind: "text", chunks: ["ana@exemplu.ro"] }], {
			onTranscript: (t) => seen.push(t),
		});
		const port = owner();
		port.config = staffConfigWith({ logging: { redactPii: false, keepTranscripts: true } });
		await collect(h.engine.chat(port, { message: "mail ion@x.ro" }));
		expect(seen[0]?.question).toBe("mail ion@x.ro");
		expect(seen[0]?.answer).toBe("ana@exemplu.ro");
	});
	it("a log hook that throws does not change the answer", async () => {
		h = await startEngine([{ kind: "text", chunks: ["Bună."] }], {
			onTranscript: () => {
				throw new Error("log down");
			},
		});
		const port = owner();
		port.config = staffConfigWith({ logging: { redactPii: true, keepTranscripts: true } });
		expect(textOf(await collect(h.engine.chat(port, { message: "salut" })))).toBe("Bună.");
	});
});
