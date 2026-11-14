import { describe, expect, it } from "vitest";
import { compressible, negotiate } from "./encoding";

describe("negotiate", () => {
	it.each([
		[undefined, null],
		["", null],
		["identity", null],
		["gzip", "gzip"],
		["br", "br"],
		["gzip, deflate, br", "br"],
		["br, gzip", "br"],
		["BR;q=0.5, GZIP", "br"],
		["br;q=0, gzip", "gzip"],
		["br;q=0, gzip;q=0", null],
		["*", "br"],
		["*;q=0", null],
		["br;q=0, *", "gzip"],
		["gzip;q=nonsense", null],
		["deflate, zstd", null],
		[" , ,gzip", "gzip"],
	] as const)("Accept-Encoding %j → %s", (header, expected) => {
		expect(negotiate(header)).toBe(expected);
	});
});

describe("compressible", () => {
	it.each([
		"text/html; charset=UTF-8",
		"text/css; charset=utf-8",
		"text/javascript; charset=utf-8",
		"application/javascript",
		"image/svg+xml",
		"application/json",
		"application/manifest+json; charset=utf-8",
		"application/xml; charset=utf-8",
		"application/rss+xml; charset=utf-8",
		"text/plain",
	])("compresses %s", (type) => {
		expect(compressible(type)).toBe(true);
	});

	it.each([
		"text/event-stream",
		"image/webp",
		"image/avif",
		"image/jpeg",
		"image/png",
		"audio/mpeg",
		"font/woff2",
		"application/octet-stream",
		"",
		"text/htmlx",
	])("leaves %j alone", (type) => {
		expect(compressible(type)).toBe(false);
	});
});
