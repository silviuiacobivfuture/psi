import { describe, expect, it } from "vitest";
import { Counter, CounterBatch } from "./analytics";

const counter = {
	day: "2026-11-12",
	brand: "psizone",
	slug: "semne-autism",
	locale: "ro",
	topic: "autism",
	metric: "view",
	count: 3,
};

describe("the analytics contract carries no personal data", () => {
	it("accepts a daily counter", () => {
		expect(Counter.parse(counter)).toEqual(counter);
	});
	it.each([
		["ip", "203.0.113.7"],
		["userAgent", "Mozilla/5.0"],
		["referrer", "https://example.com"],
		["visitorId", "abc"],
		["timestamp", "2026-11-12T10:11:12Z"],
	])("refuses any extra field (%s)", (key, value) => {
		expect(Counter.safeParse({ ...counter, [key]: value }).success).toBe(false);
		expect(CounterBatch.safeParse({ counters: [counter], [key]: value }).success).toBe(false);
	});
	it("refuses a time of day in place of a day", () => {
		expect(Counter.safeParse({ ...counter, day: "2026-11-12T10:00:00Z" }).success).toBe(false);
	});
	it("refuses an unknown metric or a free-text slug", () => {
		expect(Counter.safeParse({ ...counter, metric: "click" }).success).toBe(false);
		expect(Counter.safeParse({ ...counter, slug: "ana@example.com" }).success).toBe(false);
	});
});
