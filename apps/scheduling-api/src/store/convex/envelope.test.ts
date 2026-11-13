import { describe, expect, it } from "vitest";
import { createFieldCrypto } from "../../ports/crypto";
import { toEncrypted, toSealed } from "./envelope";

const crypto = createFieldCrypto("ab".repeat(32));

describe("the sealed text and Convex's encrypted field are one value in two shapes", () => {
	it("round-trips and still opens, only in its own context", () => {
		const sealed = crypto.seal("synthetic-diagnosis", "psizone:client:c1:clinical");
		const enc = toEncrypted(sealed);
		expect(Object.keys(enc).sort()).toEqual(["data", "iv", "keyVersion"]);
		expect(toSealed(enc)).toBe(sealed);
		expect(crypto.open(toSealed(enc), "psizone:client:c1:clinical")).toBe("synthetic-diagnosis");
		expect(() => crypto.open(toSealed(enc), "psizone:client:c2:clinical")).toThrow();
	});

	it("holds no plain text", () => {
		expect(JSON.stringify(toEncrypted(crypto.seal("synthetic-diagnosis", "c")))).not.toContain(
			"synthetic",
		);
	});

	it("refuses what is not ours: another version, a truncated value, a foreign string", () => {
		const enc = toEncrypted(crypto.seal("x", "c"));
		expect(() => toSealed({ ...enc, keyVersion: 2 })).toThrow();
		expect(() => toSealed({ ...enc, data: "AAAA" })).toThrow();
		expect(() => toEncrypted("plain text")).toThrow();
	});
});
