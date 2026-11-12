import { describe, expect, it } from "vitest";
import { signPreview, signWebhook, verifyPreview, verifyWebhook } from "./signing";

const SECRET = "s".repeat(32);
const now = new Date("2026-11-12T10:00:00Z");

describe("signed preview links", () => {
	it("round-trips a document id and locale", () => {
		const t = signPreview("42", "en", SECRET, now);
		expect(verifyPreview(t, SECRET, now)).toMatchObject({ id: "42", locale: "en" });
	});
	it("refuses an expired link", () => {
		const t = signPreview("42", "ro", SECRET, now, 60);
		expect(verifyPreview(t, SECRET, new Date(now.getTime() + 61_000))).toBeNull();
	});
	it("refuses another secret, a tampered body and junk", () => {
		const t = signPreview("42", "ro", SECRET, now);
		expect(verifyPreview(t, "x".repeat(32), now)).toBeNull();
		const [, sig] = t.split(".");
		const forged = `${Buffer.from(JSON.stringify({ id: "43", locale: "ro", exp: 9e9 })).toString("base64url")}.${sig}`;
		expect(verifyPreview(forged, SECRET, now)).toBeNull();
		expect(verifyPreview("nope", SECRET, now)).toBeNull();
		expect(verifyPreview(`${t}.x`, SECRET, now)).toBeNull();
	});
	it("refuses to work with a short secret", () => {
		const t = signPreview("42", "ro", "short", now);
		expect(verifyPreview(t, "short", now)).toBeNull();
	});
});

describe("webhook signatures", () => {
	it("accepts the signed body only", () => {
		const body = JSON.stringify({ slug: "a" });
		const sig = signWebhook(body, SECRET);
		expect(verifyWebhook(body, sig, SECRET)).toBe(true);
		expect(verifyWebhook(`${body} `, sig, SECRET)).toBe(false);
		expect(verifyWebhook(body, "00", SECRET)).toBe(false);
	});
});
