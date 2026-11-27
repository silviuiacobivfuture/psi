import { describe, expect, it } from "vitest";
import { BROWSER_COOKIE_CAP_SECONDS, sessionSeconds, slideDue } from "./session-lifetime";

const HOUR = 3_600;
const DAY = 86_400;

describe("sessionSeconds — the estate's SESSION_LIFETIME", () => {
	it.each([
		["absent", undefined],
		["blank", ""],
		["never", "never"],
	])("%s is never: the longest a browser keeps a cookie, renewed on use", (_label, raw) => {
		expect(sessionSeconds(raw)).toBe(BROWSER_COOKIE_CAP_SECONDS);
		expect(BROWSER_COOKIE_CAP_SECONDS).toBe(400 * DAY);
	});

	it("never outlasts four months away (the owner's bound, 16 Nov)", () => {
		expect(sessionSeconds("never")).toBeGreaterThan(122 * DAY);
	});

	it.each([
		["1h", HOUR],
		["12h", 12 * HOUR],
		["1d", DAY],
		["30d", 30 * DAY],
		["400d", 400 * DAY],
	])("%s is %i seconds", (raw, seconds) => {
		expect(sessionSeconds(raw)).toBe(seconds);
	});

	it.each(["401d", "99999d", "99999h"])("%s is capped at what a browser keeps", (raw) => {
		expect(sessionSeconds(raw)).toBe(BROWSER_COOKIE_CAP_SECONDS);
	});

	it.each([
		"0h",
		"0d",
		"1w",
		"h",
		"1",
		"-1d",
		"01d",
		"100000d",
		"1.5d",
		" 1d",
		"Never",
		"forever",
	])("refuses %j, naming the key", (raw) => {
		expect(() => sessionSeconds(raw)).toThrow(/^SESSION_LIFETIME must be "never" or <n>h \/ <n>d/);
	});
});

describe("slideDue — renewed on use", () => {
	const now = 1_800_000_000_000;
	const life = 30 * DAY;

	it("a token issued just now is not renewed", () => {
		expect(slideDue(now + life * 1000, now, life)).toBe(false);
	});

	it("a token issued an hour ago is renewed (lifetime longer than four hours)", () => {
		expect(slideDue(now + life * 1000 - HOUR * 1000, now, life)).toBe(true);
		expect(slideDue(now + life * 1000 - HOUR * 1000 + 1, now, life)).toBe(false);
	});

	it("a short lifetime is renewed after a quarter of it", () => {
		const oneHour = HOUR;
		expect(slideDue(now + 45 * 60_000, now, oneHour)).toBe(true);
		expect(slideDue(now + 45 * 60_000 + 1, now, oneHour)).toBe(false);
	});

	it("never (400 days) is renewed hourly while in use", () => {
		const never = BROWSER_COOKIE_CAP_SECONDS;
		expect(slideDue(now + never * 1000 - HOUR * 1000, now, never)).toBe(true);
		expect(slideDue(now + never * 1000 - 59 * 60_000, now, never)).toBe(false);
	});

	it.each([
		["unknown", undefined],
		["not a number", Number.NaN],
		["already past", now - 1],
		["exactly now", now],
	])("an expiry %s is never renewed here", (_label, exp) => {
		expect(slideDue(exp, now, life)).toBe(false);
	});
});
