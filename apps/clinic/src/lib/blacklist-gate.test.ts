import { describe, expect, it } from "vitest";
import type { BlacklistEntry } from "../port/schema-clinical";
import { authorityOf, bookingGate } from "./blacklist-gate";
import { canOf } from "./can";

const caps = (keys: string[]) =>
	canOf(
		{
			app: "psizone",
			appName: "Psizone",
			timeZone: "Europe/Bucharest",
			subject: "s",
			roles: [],
			permissions: Object.fromEntries(keys.map((k) => [k, ["all" as const]])),
			denied: [],
			fieldGroups: [],
			reach: { own: [], assigned: [] },
			platformAdmin: false,
		},
		false,
	);
const entry = (severity: BlacklistEntry["severity"]): BlacklistEntry => ({
	id: "b1",
	clientId: "c1",
	reason: "motiv",
	category: "other",
	severity,
	createdAt: "2026-11-16T09:00:00",
	createdBy: "Ana",
	expiresOn: null,
	endedAt: null,
	endedBy: null,
	endReason: null,
});

describe("booking someone on the blacklist", () => {
	it("nobody on the list: allowed", () => {
		expect(bookingGate(null, "", caps([])).outcome).toBe("allow");
	});
	it("a warning needs a typed reason; with one anyone may go on", () => {
		expect(bookingGate(entry("warn"), "", caps([])).outcome).toBe("warning");
		expect(bookingGate(entry("warn"), "   ", caps([])).outcome).toBe("warning");
		expect(bookingGate(entry("warn"), "Știu situația", caps([])).outcome).toBe("overridden");
	});
	it("an online block needs a staff override with a reason; an acknowledgement is not enough", () => {
		expect(bookingGate(entry("block_online"), "", caps(["blacklist_override"])).outcome).toBe(
			"blocked",
		);
		expect(bookingGate(entry("block_online"), "motiv", caps([])).outcome).toBe("blocked");
		expect(bookingGate(entry("block_online"), "motiv", caps(["blacklist_override"])).outcome).toBe(
			"overridden",
		);
	});
	it("a total block needs the administrator's override", () => {
		expect(bookingGate(entry("block_all"), "motiv", caps(["blacklist_override"])).outcome).toBe(
			"blocked",
		);
		expect(
			bookingGate(entry("block_all"), "motiv", caps(["blacklist_override_admin"])).outcome,
		).toBe("overridden");
	});
	it("the authority is the strongest key held", () => {
		expect(authorityOf(caps([]))).toBe("ack");
		expect(authorityOf(caps(["blacklist_override"]))).toBe("staff");
		expect(authorityOf(caps(["blacklist_override", "blacklist_override_admin"]))).toBe("admin");
	});
});
