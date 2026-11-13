import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { staffMemoryFrom } from "./memory";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "clinic-mem-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const KEY = { OPENROUTER_API_KEY: "k" };
const HEX = "c".repeat(64);

describe("where the staff assistant's memory lives", () => {
	it("nothing is made without a model key: the assistant is off", () => {
		expect(staffMemoryFrom({ CLINIC_FAKE_PORT: "1" }, dir)).toBeUndefined();
		expect(existsSync(join(dir, "staff-memory.key"))).toBe(false);
	});
	it("the development fake: a file store and its own key under the data folder, the same key next time", () => {
		const first = staffMemoryFrom({ ...KEY, CLINIC_FAKE_PORT: "1" }, dir);
		expect(first?.url).toBe(`file:${join(dir, "staff-memory.db")}`);
		expect(first?.root.length).toBe(32);
		expect(statSync(join(dir, "staff-memory.key")).mode & 0o777).toBe(0o600);
		expect(readFileSync(join(dir, "staff-memory.key"), "utf8")).toHaveLength(64);
		const again = staffMemoryFrom({ ...KEY, CLINIC_FAKE_PORT: "1" }, dir);
		expect(again?.root.equals(first?.root ?? Buffer.alloc(0))).toBe(true);
	});
	it("production without a key refuses to start, naming it; with one but no store, names the store", () => {
		expect(() =>
			staffMemoryFrom({ ...KEY, NODE_ENV: "production", STAFF_MEMORY_URL: "file:/v/m.db" }, dir),
		).toThrow(/MISSING REQUIRED SECRET: STAFF_MEMORY_KEY/);
		expect(() =>
			staffMemoryFrom({ ...KEY, NODE_ENV: "production", STAFF_MEMORY_KEY: HEX }, dir),
		).toThrow(/MISSING REQUIRED SETTING: STAFF_MEMORY_URL/);
		expect(existsSync(join(dir, "staff-memory.key"))).toBe(false);
	});
	it("production with a dedicated key, or one derived from the master key", () => {
		const own = staffMemoryFrom(
			{ ...KEY, NODE_ENV: "production", STAFF_MEMORY_URL: "file:/v/m.db", STAFF_MEMORY_KEY: HEX },
			dir,
		);
		expect(own?.root.toString("hex")).toBe(HEX);
		const derived = staffMemoryFrom(
			{ ...KEY, NODE_ENV: "production", STAFF_MEMORY_URL: "file:/v/m.db", CLINIC_MASTER_KEY: HEX },
			dir,
		);
		expect(derived?.root.toString("hex")).not.toBe(HEX);
		expect(derived?.url).toBe("file:/v/m.db");
	});
	it("a malformed key is an error even in development", () => {
		expect(() =>
			staffMemoryFrom({ ...KEY, CLINIC_FAKE_PORT: "1", STAFF_MEMORY_KEY: "nope" }, dir),
		).toThrow(/64 hex/);
	});
});
