import { describe, expect, it } from "vitest";
import { fileDirectory } from "../memory";

describe("memory", () => {
	it("creates the directory of a file URL and leaves other URLs alone", () => {
		expect(fileDirectory("file:.data/guide.db")).toMatch(/\.data$/);
		expect(fileDirectory("file:///var/lib/psi/guide.db")).toBe("/var/lib/psi");
		expect(fileDirectory("libsql://psi.turso.io")).toBeUndefined();
		expect(fileDirectory(":memory:")).toBeUndefined();
	});
});
