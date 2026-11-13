import { describe, expect, it } from "vitest";
import {
	AUTHORITY_NEEDED,
	type BlacklistEntry,
	blacklistGate,
	blacklistInputSchema,
	blacklistMatch,
	blacklistPatchSchema,
	type Override,
	overrideSchema,
	REASON_MAX,
	severityAllowed,
} from "../clinic/blacklist";

const NOW = Date.parse("2026-11-13T10:00:00Z");
const entry = (over: Partial<BlacklistEntry> & { id: string }): BlacklistEntry => ({
	reason: "r",
	category: "other",
	severity: "warn",
	active: true,
	createdAt: 1,
	...over,
});

describe("blacklistInputSchema", () => {
	const base = {
		reason: "did not come three times",
		category: "no_show_repeated",
		severity: "warn",
	} as const;

	it("normalises the phone and the e-mail and keeps the optional name", () => {
		const out = blacklistInputSchema.parse({
			...base,
			phone: "0748 017 752",
			email: " A@X.RO ",
			name: " Ana ",
		});
		expect(out).toMatchObject({
			phone: "+40748017752",
			email: "a@x.ro",
			name: "Ana",
		});
	});

	it("accepts a client alone, a phone alone, an e-mail alone", () => {
		for (const id of [{ client: "c1" }, { phone: "0748017752" }, { email: "a@x.ro" }]) {
			expect(blacklistInputSchema.safeParse({ ...base, ...id }).success).toBe(true);
		}
	});

	it("refuses an entry that names no client, phone or e-mail (a name alone never blocks)", () => {
		const out = blacklistInputSchema.safeParse({ ...base, name: "Ana Pop" });
		expect(out.success).toBe(false);
	});

	it.each([
		["a bad phone", { phone: "12" }],
		["a bad e-mail", { email: "nope" }],
		["an empty reason", { client: "c", reason: "   " }],
		["a reason one over the limit", { client: "c", reason: "x".repeat(REASON_MAX + 1) }],
		["an unknown category", { client: "c", category: "rude" }],
		["an unknown severity", { client: "c", severity: "ban" }],
		["a zero expiry", { client: "c", expiresAt: 0 }],
		["a fractional expiry", { client: "c", expiresAt: 1.5 }],
		["an empty name", { client: "c", name: "  " }],
	])("refuses %s", (_label, over) => {
		expect(blacklistInputSchema.safeParse({ ...base, client: "c", ...over }).success).toBe(false);
	});

	it("takes a reason of exactly the limit", () => {
		const reason = "é".repeat(REASON_MAX);
		expect(blacklistInputSchema.safeParse({ ...base, client: "c", reason }).success).toBe(true);
	});

	it("the patch takes any subset, normalised, and nothing unknown", () => {
		expect(blacklistPatchSchema.parse({ phone: "0722 000 111", active: false })).toEqual({
			phone: "+40722000111",
			active: false,
		});
		expect(blacklistPatchSchema.parse({})).toEqual({});
		expect(blacklistPatchSchema.safeParse({ tenant: "x" }).success).toBe(false);
		expect(blacklistPatchSchema.safeParse({ reason: " " }).success).toBe(false);
	});
});

describe("blacklistMatch", () => {
	it("is nothing for nothing", () => {
		expect(blacklistMatch({ phones: ["0748017752"] }, [], NOW)).toBeUndefined();
		expect(blacklistMatch({}, [entry({ id: "a", phone: "+40748017752" })], NOW)).toBeUndefined();
	});

	it("matches a phone however it is typed, and says which identifier matched", () => {
		const hit = blacklistMatch(
			{ phones: ["0040 748 017 752"] },
			[entry({ id: "a", phone: "+40748017752" })],
			NOW,
		);
		expect(hit?.via).toBe("phone");
		expect(hit?.matched).toEqual(["phone"]);
		expect(hit?.entry.id).toBe("a");
	});

	it("matches an e-mail case-insensitively", () => {
		const hit = blacklistMatch(
			{ emails: ["ANA@X.RO"] },
			[entry({ id: "a", email: "ana@x.ro" })],
			NOW,
		);
		expect(hit?.via).toBe("email");
	});

	it("matches a client record", () => {
		const hit = blacklistMatch({ clients: ["c1", "c2"] }, [entry({ id: "a", client: "c2" })], NOW);
		expect(hit?.via).toBe("client");
		expect(
			blacklistMatch({ clients: ["c1"] }, [entry({ id: "a", client: "c2" })], NOW),
		).toBeUndefined();
	});

	it("lists every identifier shared, strongest first (client, phone, e-mail)", () => {
		const hit = blacklistMatch(
			{ clients: ["c1"], phones: ["0748017752"], emails: ["a@x.ro"] },
			[
				entry({
					id: "a",
					client: "c1",
					phone: "+40748017752",
					email: "a@x.ro",
				}),
			],
			NOW,
		);
		expect(hit?.matched).toEqual(["client", "phone", "email"]);
		expect(hit?.via).toBe("client");
	});

	it("never matches on a name alone, but reports when the name agrees", () => {
		const named = entry({ id: "a", phone: "+40748017752", name: "Ana Pop" });
		expect(blacklistMatch({ name: "Ana Pop" }, [named], NOW)).toBeUndefined();
		expect(
			blacklistMatch({ name: "ana  pop", phones: ["0748017752"] }, [named], NOW)?.nameAgrees,
		).toBe(true);
		expect(blacklistMatch({ name: "Ion", phones: ["0748017752"] }, [named], NOW)?.nameAgrees).toBe(
			false,
		);
		expect(
			blacklistMatch({ name: "Ană Pop", phones: ["0748017752"] }, [named], NOW)?.nameAgrees,
		).toBe(true);
	});

	it("ignores an entry switched off or past its expiry; the expiry instant itself no longer applies", () => {
		const off = entry({ id: "a", phone: "+40748017752", active: false });
		const until = entry({ id: "b", phone: "+40748017752", expiresAt: NOW });
		expect(blacklistMatch({ phones: ["0748017752"] }, [off, until], NOW)).toBeUndefined();
		expect(blacklistMatch({ phones: ["0748017752"] }, [until], NOW - 1)?.entry.id).toBe("b");
	});

	it("returns the harshest severity", () => {
		const hit = blacklistMatch(
			{ phones: ["0748017752"], emails: ["a@x.ro"] },
			[
				entry({ id: "w", phone: "+40748017752", severity: "warn" }),
				entry({ id: "all", email: "a@x.ro", severity: "block_all" }),
				entry({ id: "on", phone: "+40748017752", severity: "block_online" }),
			],
			NOW,
		);
		expect(hit?.entry.id).toBe("all");
	});

	it("breaks a severity tie by the surer identifier, then the newer entry, then the id, whatever the order", () => {
		const byPhone = entry({
			id: "p",
			phone: "+40748017752",
			severity: "block_online",
			createdAt: 9,
		});
		const byClient = entry({
			id: "c",
			client: "c1",
			severity: "block_online",
			createdAt: 1,
		});
		const candidate = { clients: ["c1"], phones: ["0748017752"] };
		expect(blacklistMatch(candidate, [byPhone, byClient], NOW)?.entry.id).toBe("c");
		expect(blacklistMatch(candidate, [byClient, byPhone], NOW)?.entry.id).toBe("c");
		const older = entry({ id: "z", phone: "+40748017752", createdAt: 1 });
		const newer = entry({ id: "a", phone: "+40748017752", createdAt: 2 });
		expect(blacklistMatch({ phones: ["0748017752"] }, [older, newer], NOW)?.entry.id).toBe("a");
		const same1 = entry({ id: "b", phone: "+40748017752", createdAt: 2 });
		expect(blacklistMatch({ phones: ["0748017752"] }, [same1, newer], NOW)?.entry.id).toBe("a");
		expect(blacklistMatch({ phones: ["0748017752"] }, [newer, same1], NOW)?.entry.id).toBe("a");
	});

	it("a guardian's phone in the candidate finds the entry (a child books through it)", () => {
		const hit = blacklistMatch(
			{ phones: [undefined, "0722 000 111"] },
			[entry({ id: "a", phone: "+40722000111" })],
			NOW,
		);
		expect(hit?.entry.id).toBe("a");
	});
});

describe("blacklistGate", () => {
	const hitOf = (severity: BlacklistEntry["severity"]) =>
		blacklistMatch(
			{ phones: ["0748017752"] },
			[entry({ id: "a", phone: "+40748017752", severity })],
			NOW,
		);
	const ov = (authority: Override["authority"], reason = "the owner agreed"): Override => ({
		authority,
		reason,
	});

	it("allows when there is no hit, on both channels", () => {
		expect(blacklistGate("online", undefined)).toEqual({ outcome: "allow" });
		expect(blacklistGate("staff", undefined)).toEqual({ outcome: "allow" });
	});

	it("online: warn is allowed, both blocking severities are refused", () => {
		expect(blacklistGate("online", hitOf("warn")).outcome).toBe("allow");
		expect(blacklistGate("online", hitOf("block_online")).outcome).toBe("unavailable_online");
		expect(blacklistGate("online", hitOf("block_all")).outcome).toBe("unavailable_online");
	});

	it("online: an override changes nothing", () => {
		expect(blacklistGate("online", hitOf("block_online"), ov("admin")).outcome).toBe(
			"unavailable_online",
		);
	});

	it("staff without an override: warning for warn, blocked for the other two, saying what is needed", () => {
		expect(blacklistGate("staff", hitOf("warn"))).toMatchObject({
			outcome: "warning",
			needs: "ack",
		});
		expect(blacklistGate("staff", hitOf("block_online"))).toMatchObject({
			outcome: "blocked",
			needs: "staff",
		});
		expect(blacklistGate("staff", hitOf("block_all"))).toMatchObject({
			outcome: "blocked",
			needs: "admin",
		});
	});

	it.each([
		["warn", "ack", "overridden"],
		["warn", "staff", "overridden"],
		["warn", "admin", "overridden"],
		["block_online", "ack", "blocked"],
		["block_online", "staff", "overridden"],
		["block_online", "admin", "overridden"],
		["block_all", "ack", "blocked"],
		["block_all", "staff", "blocked"],
		["block_all", "admin", "overridden"],
	] as const)("staff, %s with %s authority: %s", (severity, authority, outcome) => {
		expect(blacklistGate("staff", hitOf(severity), ov(authority)).outcome).toBe(outcome);
	});

	it("an override without a reason is no override", () => {
		expect(blacklistGate("staff", hitOf("warn"), ov("admin", "  ")).outcome).toBe("warning");
		expect(blacklistGate("staff", hitOf("block_all"), ov("admin", "")).outcome).toBe("blocked");
		expect(overrideSchema.safeParse(ov("admin", "x".repeat(501))).success).toBe(false);
		expect(overrideSchema.safeParse(ov("admin", "x".repeat(500))).success).toBe(true);
	});

	it("the needed authority per severity is fixed", () => {
		expect(AUTHORITY_NEEDED).toEqual({
			warn: "ack",
			block_online: "staff",
			block_all: "admin",
		});
	});

	it("a warn-only caller may flag at warn and nothing stronger", () => {
		expect(severityAllowed("warn", "warn_only")).toBe(true);
		expect(severityAllowed("block_online", "warn_only")).toBe(false);
		expect(severityAllowed("block_all", "warn_only")).toBe(false);
		expect(severityAllowed("block_all", "any")).toBe(true);
	});
});
