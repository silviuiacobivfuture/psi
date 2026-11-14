import { describe, expect, it } from "vitest";
import { redactIdentifiers } from "../screening/redact-text";

describe("identifiers kept out of the logs", () => {
	it.each([
		["mail ana.pop@exemplu.ro acum", "mail [EMAIL] acum"],
		["sună la 0722 123 456", "sună la [TELEFON]"],
		["sună la +40 722 123 456", "sună la [TELEFON]"],
		["call +44 20 7946 0958", "call [PHONE]"],
		["CNP 1960101123456.", "CNP [CNP]."],
		["IBAN RO49 AAAA 1B31 0075 9384 0000", "IBAN [IBAN]"],
		["cont 123456789012", "cont [NUMBER]"],
	])("%s", (text, expected) => {
		expect(redactIdentifiers(text)).toBe(expected);
	});
	it("leaves what identifies nobody: times, short numbers, stages and HTTP statuses", () => {
		for (const text of [
			"",
			"ProviderError: model (HTTP 503): unavailable",
			"la 10:30, camera 2, 45 de minute",
			"ăâîșț — ✓",
		])
			expect(redactIdentifiers(text)).toBe(text);
	});
	it("gives the same answer twice (no rule keeps state between calls)", () => {
		const text = "a@b.ro și c@d.ro";
		expect(redactIdentifiers(text)).toBe("[EMAIL] și [EMAIL]");
		expect(redactIdentifiers(text)).toBe("[EMAIL] și [EMAIL]");
	});
});
