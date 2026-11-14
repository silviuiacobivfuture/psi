import { describe, expect, it } from "vitest";
import { auditExtras } from "./audit-detail";

describe("what the service records beside an audit event", () => {
	it("reads the source, the request, the address and the device when they are there", () => {
		expect(
			auditExtras({ source: "site", requestId: "r-1", ip: "198.51.100.1", userAgent: "Safari" }),
		).toEqual({ source: "site", requestId: "r-1", ip: "198.51.100.1", device: "Safari" });
	});
	it("reads field changes from a list and from a map, either spelling", () => {
		expect(
			auditExtras({ changes: [{ field: "phone", before: "1", after: null }] }).changes,
		).toEqual([{ field: "phone", before: "1", after: null }]);
		expect(
			auditExtras({ changes: { note: { from: "a", to: "b" }, name: { before: 1, after: 2 } } })
				.changes,
		).toEqual([
			{ field: "note", before: "a", after: "b" },
			{ field: "name", before: "1", after: "2" },
		]);
	});
	it("says nothing for what was not recorded, and drops what has the wrong shape", () => {
		expect(auditExtras(undefined)).toEqual({});
		expect(auditExtras({})).toEqual({});
		expect(auditExtras({ source: "carrier-pigeon", ip: 7, changes: "many" })).toEqual({});
		expect(auditExtras({ count: 3, name: true })).toEqual({});
	});
});
