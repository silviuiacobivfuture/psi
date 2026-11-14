import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MastraDBMessage } from "@mastra/core/memory";
import { BUILT_IN_SETTINGS } from "@psi/scheduling-sdk/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Summariser } from "../../compaction";
import { RETENTION_KEY } from "../../memory-retention";
import { STAFF_EN } from "../copy";
import { openStaffMemory, STAFF_MEMORY_DAYS } from "../memory-store";
import { FakeStaffPort, OWNER_PERMISSIONS, staffConfigWith } from "../testing";
import { collect, type Harness, startEngine, textOf } from "./turn-harness";

const ROOT = Buffer.alloc(32, 7);
const DAY = 86_400_000;
const THREAD = { threadId: "staff:sub-ana:t", resourceId: "staff:sub-ana" };

let dir: string;
let h: Harness | undefined;
beforeEach(() => {
	vi.stubEnv("OPENROUTER_API_KEY", "");
	dir = mkdtempSync(join(tmpdir(), "staff-policy-"));
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await h?.close();
	h = undefined;
	rmSync(dir, { recursive: true, force: true });
});

const message = (n: number, at: number): MastraDBMessage => ({
	id: `m${n}`,
	role: n % 2 === 0 ? "user" : "assistant",
	createdAt: new Date(at),
	...THREAD,
	content: { format: 2, parts: [{ type: "text", text: `mesajul ${n}` }] },
});
const texts = (ms: ReadonlyArray<MastraDBMessage>): Array<string> =>
	ms.map((m) => m.content.parts.map((p) => (p.type === "text" ? p.text : "")).join(""));

async function seeded(url: string, count: number, at: (n: number) => number) {
	const staff = openStaffMemory({ url, root: ROOT });
	await staff.memory.createThread(THREAD);
	await staff.memory.saveMessages({
		messages: Array.from({ length: count }, (_, n) => message(n, at(n))),
	});
	return staff;
}
const read = async (staff: ReturnType<typeof openStaffMemory>) =>
	(await staff.memory.recall({ ...THREAD, perPage: false })).messages;
const owner = (): FakeStaffPort => {
	const port = new FakeStaffPort();
	port.permissions = OWNER_PERMISSIONS;
	return port;
};
const S = BUILT_IN_SETTINGS.staff;

describe("retention: each conversation is kept as long as its organisation says", () => {
	it("a turn stamps the organisation's retention on its conversation", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const staff = await seeded(url, 1, () => Date.now());
		h = await startEngine([{ kind: "text", chunks: ["Bună."] }], { memory: { url, root: ROOT } });
		const port = owner();
		port.config = staffConfigWith({ memory: { ...S.memory, retentionDays: 7 } });
		await collect(h.engine.chat(port, { message: "salut", threadId: "t" }));
		const thread = await staff.memory.getThreadById({ threadId: THREAD.threadId });
		expect(thread?.metadata?.[RETENTION_KEY]).toBe(7);
	});
	it("shorter than the default: what is older than it goes, what is newer stays", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const now = Date.now();
		const staff = await seeded(url, 2, (n) => (n === 0 ? now - 10 * DAY : now - DAY));
		const thread = await staff.memory.getThreadById({ threadId: THREAD.threadId });
		await staff.memory.updateThread({
			id: THREAD.threadId,
			title: thread?.title ?? "",
			metadata: { [RETENTION_KEY]: 7 },
		});
		expect(await staff.sweep(now)).toBe(1);
		expect(texts(await read(staff))).toEqual(["mesajul 1"]);
	});
	it("longer than the default: a message past 30 days survives until its own retention", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const now = Date.now();
		const staff = await seeded(url, 1, () => now - 40 * DAY);
		await staff.memory.updateThread({
			id: THREAD.threadId,
			title: "",
			metadata: { [RETENTION_KEY]: 90 },
		});
		expect(STAFF_MEMORY_DAYS).toBe(30);
		expect(await staff.sweep(now)).toBe(0);
		expect(texts(await read(staff))).toEqual(["mesajul 0"]);
		expect(await staff.sweep(now + 51 * DAY)).toBe(1);
		expect(await read(staff)).toEqual([]);
	});
	it("a conversation never stamped keeps the default", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const now = Date.now();
		const staff = await seeded(url, 2, (n) => (n === 0 ? now - 31 * DAY : now - 29 * DAY));
		expect(await staff.sweep(now)).toBe(1);
		expect(texts(await read(staff))).toEqual(["mesajul 1"]);
	});
});

describe("compaction: a long conversation's older part becomes one summary", () => {
	const calls: Array<{ model: string; transcript: string }> = [];
	const summariser: Summariser = async ({ model, transcript }) => {
		calls.push({ model, transcript });
		return {
			text: "Ana a cerut o programare.",
			usage: {
				inputTokens: 300,
				outputTokens: 40,
				cachedTokens: 0,
				costMicroUsd: 12,
				limitHit: false,
			},
		};
	};
	const failing: Summariser = async () => {
		throw new Error("summary down for ana@exemplu.ro, CNP 1960101123456");
	};
	beforeEach(() => {
		calls.length = 0;
	});
	const compactAt = (compactAfter: number, historyMessages: number) =>
		staffConfigWith({
			model: { ...S.model, summary: "vendor/cheap" },
			memory: { ...S.memory, compactAfter, historyMessages },
		});

	it("within the window nothing is summarised and nothing changes", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const staff = await seeded(url, 6, (n) => Date.now() - (10 - n) * 1_000);
		h = await startEngine([{ kind: "text", chunks: ["Bună."] }], {
			memory: { url, root: ROOT },
			summariser,
		});
		const port = owner();
		port.config = compactAt(6, 2);
		await collect(h.engine.chat(port, { message: "salut", threadId: "t" }));
		expect(calls).toEqual([]);
		expect(texts(await read(staff)).slice(0, 6)).toEqual(
			Array.from({ length: 6 }, (_, n) => `mesajul ${n}`),
		);
	});
	it("past it: one call with the summary model, the older part replaced, the recent kept, its cost counted", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const staff = await seeded(url, 8, (n) => Date.now() - (10 - n) * 1_000);
		h = await startEngine(
			[
				{ kind: "text", chunks: ["Bună."], usage: { prompt: 1_000, completion: 10 } },
				{ kind: "text", chunks: ["Din nou."] },
			],
			{ memory: { url, root: ROOT }, summariser },
		);
		const port = owner();
		port.config = compactAt(6, 2);
		const events = await collect(h.engine.chat(port, { message: "salut", threadId: "t" }));
		expect(textOf(events)).toBe("Bună.");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.model).toBe("vendor/cheap");
		expect(calls[0]?.transcript).toContain("mesajul 5");
		expect(calls[0]?.transcript).not.toContain("mesajul 6");
		const after = texts(await read(staff));
		expect(after[0]).toBe(`${STAFF_EN.summaryHeading}\nAna a cerut o programare.`);
		expect(after.slice(1, 3)).toEqual(["mesajul 6", "mesajul 7"]);
		expect(after.filter((t) => /^mesajul [0-5]$/.test(t))).toEqual([]);
		// The model read the summary back with the recent messages.
		expect(JSON.stringify(h.fake.requests[0]?.body)).toContain("Ana a cerut o programare.");
		expect(port.usage).toEqual([
			{ inputTokens: 1_300, outputTokens: 50, cachedTokens: 0, costMicroUsd: 12, limitHit: false },
		]);
		// Turns later, past the window of recent messages, the summary is still what the model reads of the older part.
		await collect(h.engine.chat(port, { message: "și acum?", threadId: "t" }));
		expect(calls).toHaveLength(1);
		expect(JSON.stringify(h.fake.requests[1]?.body)).toContain("Ana a cerut o programare.");
	});
	it("a summary that fails loses nothing: the turn goes on, the failure is logged redacted", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const staff = await seeded(url, 8, (n) => Date.now() - (10 - n) * 1_000);
		h = await startEngine([{ kind: "text", chunks: ["Bună."] }], {
			memory: { url, root: ROOT },
			summariser: failing,
		});
		const port = owner();
		port.config = compactAt(6, 2);
		expect(textOf(await collect(h.engine.chat(port, { message: "salut", threadId: "t" })))).toBe(
			"Bună.",
		);
		expect(texts(await read(staff)).slice(0, 8)).toEqual(
			Array.from({ length: 8 }, (_, n) => `mesajul ${n}`),
		);
		const logged = h.failures.filter((f) => f.startsWith("compaction"));
		expect(logged).toHaveLength(1);
		expect(logged[0]).not.toContain("ana@exemplu.ro");
		expect(logged[0]).not.toContain("1960101123456");
		expect(logged[0]).toContain("[EMAIL]");
	});
	it("an organisation that switched redaction off sees the failure as it was", async () => {
		const url = `file:${join(dir, "s.db")}`;
		await seeded(url, 8, (n) => Date.now() - (10 - n) * 1_000);
		h = await startEngine([{ kind: "text", chunks: ["Bună."] }], {
			memory: { url, root: ROOT },
			summariser: failing,
		});
		const port = owner();
		port.config = staffConfigWith({
			memory: { ...S.memory, compactAfter: 6, historyMessages: 2 },
			logging: { redactPii: false, keepTranscripts: false },
		});
		await collect(h.engine.chat(port, { message: "salut", threadId: "t" }));
		expect(h.failures.find((f) => f.startsWith("compaction"))).toContain("ana@exemplu.ro");
	});
});
