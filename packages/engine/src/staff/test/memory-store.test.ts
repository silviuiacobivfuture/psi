import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openMemory } from "../../memory";
import { createSealer, SEAL_PREFIX, sealRootFrom } from "../memory-seal";
import { openStaffMemory } from "../memory-store";

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);

describe("the key", () => {
	it("STAFF_MEMORY_KEY wins; the master key yields a different, derived key; neither is an error-free silence", () => {
		const own = sealRootFrom({ STAFF_MEMORY_KEY: HEX_A, CLINIC_MASTER_KEY: HEX_B });
		expect(own?.source).toBe("STAFF_MEMORY_KEY");
		expect(own?.key.toString("hex")).toBe(HEX_A);
		const derived = sealRootFrom({ CLINIC_MASTER_KEY: HEX_B });
		expect(derived?.source).toBe("CLINIC_MASTER_KEY");
		expect(derived?.key.toString("hex")).not.toBe(HEX_B);
		expect(derived?.key.length).toBe(32);
		expect(
			sealRootFrom({ CLINIC_MASTER_KEY: HEX_B })?.key.equals(derived?.key ?? Buffer.alloc(0)),
		).toBe(true);
		expect(sealRootFrom({})).toBeUndefined();
		expect(sealRootFrom({ STAFF_MEMORY_KEY: "  " })).toBeUndefined();
	});
	it.each([
		"short",
		"z".repeat(64),
		"a".repeat(63),
		"a".repeat(65),
	])("a malformed key (%#) is refused, not ignored", (bad) => {
		expect(() => sealRootFrom({ STAFF_MEMORY_KEY: bad })).toThrow(/64 hex/);
		expect(() => sealRootFrom({ CLINIC_MASTER_KEY: bad })).toThrow(/64 hex/);
	});
});

describe("sealing", () => {
	const sealer = createSealer(Buffer.alloc(32, 1));
	it("round-trips, including unicode and the empty text, and never repeats", () => {
		for (const text of ["", "Ana Popescu · 10:30 ✓ — ăâîșț", "x".repeat(50_000)]) {
			const a = sealer.seal("staff:ana", text);
			expect(a.startsWith(SEAL_PREFIX)).toBe(true);
			expect(a).not.toContain(text === "" ? "\u0000" : text.slice(0, 8));
			expect(sealer.open("staff:ana", a)).toBe(text);
		}
		expect(sealer.seal("staff:ana", "same")).not.toBe(sealer.seal("staff:ana", "same"));
	});
	it("does not open for another person, another key, damage, or plain text", () => {
		const sealed = sealer.seal("staff:ana", "secret");
		expect(sealer.open("staff:dan", sealed)).toBeUndefined();
		expect(createSealer(Buffer.alloc(32, 2)).open("staff:ana", sealed)).toBeUndefined();
		const flipped = `${sealed.slice(0, -2)}${sealed.endsWith("AA") ? "BB" : "AA"}`;
		expect(sealer.open("staff:ana", flipped)).toBeUndefined();
		expect(sealer.open("staff:ana", `${SEAL_PREFIX}`)).toBeUndefined();
		expect(sealer.open("staff:ana", "secret")).toBeUndefined();
	});
	it("refuses a key of the wrong size", () => {
		expect(() => createSealer(Buffer.alloc(16))).toThrow(/32 bytes/);
	});
});

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "staff-seal-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ROOT = Buffer.alloc(32, 9);
const text = (m: { content: { parts: ReadonlyArray<{ type: string; text?: string }> } }): string =>
	m.content.parts.map((p) => p.text ?? "").join("");

async function remember(url: string, root: Buffer, days?: number) {
	const staff = openStaffMemory({ url, root, ...(days === undefined ? {} : { days }) });
	await staff.memory.createThread({ threadId: "staff:ana:t1", resourceId: "staff:ana" });
	await staff.memory.saveMessages({
		messages: [
			{
				id: "m1",
				role: "user",
				createdAt: new Date(),
				threadId: "staff:ana:t1",
				resourceId: "staff:ana",
				content: {
					format: 2,
					parts: [{ type: "text", text: "move Ana Popescu to the blue room" }],
				},
			},
		],
	});
	return staff;
}

describe("the durable store", () => {
	it("what is on disk is the envelope, what the engine reads is the conversation", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const staff = await remember(url, ROOT);
		const read = await staff.memory.recall({
			threadId: "staff:ana:t1",
			resourceId: "staff:ana",
			perPage: false,
		});
		expect(read.messages.map(text)).toEqual(["move Ana Popescu to the blue room"]);
		// the same file opened without the sealing: only the envelope is there
		const raw = await openMemory(url, "raw").recall({
			threadId: "staff:ana:t1",
			resourceId: "staff:ana",
			perPage: false,
		});
		expect(raw.messages).toHaveLength(1);
		const stored = raw.messages.map(text).join("");
		expect(stored.startsWith(SEAL_PREFIX)).toBe(true);
		expect(stored).not.toContain("Ana");
		expect(stored).not.toContain("blue");
	});
	it("survives a restart with the same key; with another key nothing is read and nothing breaks", async () => {
		const url = `file:${join(dir, "s.db")}`;
		await remember(url, ROOT);
		const again = openStaffMemory({ url, root: ROOT });
		const same = await again.memory.recall({
			threadId: "staff:ana:t1",
			resourceId: "staff:ana",
			perPage: false,
		});
		expect(same.messages.map(text)).toEqual(["move Ana Popescu to the blue room"]);
		const other = openStaffMemory({ url, root: Buffer.alloc(32, 3) });
		const none = await other.memory.recall({
			threadId: "staff:ana:t1",
			resourceId: "staff:ana",
			perPage: false,
		});
		expect(none.messages).toEqual([]);
	});
	it("the sweep deletes what is older than the retention and keeps what is not", async () => {
		const url = `file:${join(dir, "s.db")}`;
		const kept = await remember(url, ROOT);
		expect(await kept.sweep()).toBe(0);
		const read = await kept.memory.recall({
			threadId: "staff:ana:t1",
			resourceId: "staff:ana",
			perPage: false,
		});
		expect(read.messages).toHaveLength(1);
		const url0 = `file:${join(dir, "gone.db")}`;
		const gone = await remember(url0, ROOT, 0);
		await new Promise((r) => setTimeout(r, 20));
		expect(await gone.sweep()).toBeGreaterThan(0);
		const after = await gone.memory
			.recall({ threadId: "staff:ana:t1", resourceId: "staff:ana", perPage: false })
			.catch(() => ({ messages: [] }));
		expect(after.messages).toEqual([]);
	});
});
