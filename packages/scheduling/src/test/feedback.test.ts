import { describe, expect, it } from "vitest";
import {
	FEEDBACK_STATUSES,
	type FeedbackEvent,
	feedbackInputSchema,
	feedbackProblems,
	nextStatus,
	replyInputSchema,
	TEXT_MAX,
} from "../clinic/feedback";
import {
	deriveLinkKey,
	LINK_TTL_MAX_HOURS,
	LINK_TTL_MIN_HOURS,
	type LinkClaims,
	newLinkId,
	signLink,
	ttlAllowed,
	verifyLink,
} from "../clinic/feedback-link";

const rating = {
	kind: "appointment_rating",
	rating: 5,
	channel: "account",
	visit: "v1",
	consentContact: false,
} as const;
const problems = (over: Record<string, unknown>) => {
	const out = feedbackInputSchema.safeParse({ ...rating, ...over });
	return out.success ? [] : [...new Set(out.error.issues.map((i) => i.message))];
};

describe("feedbackInputSchema", () => {
	it("takes a rating of an appointment, a note, a suggestion, a complaint and a site issue", () => {
		expect(feedbackInputSchema.safeParse(rating).success).toBe(true);
		for (const kind of ["general", "suggestion", "complaint"]) {
			expect(
				feedbackInputSchema.safeParse({
					kind,
					text: "nice",
					channel: "chat",
					consentContact: false,
				}).success,
			).toBe(true);
		}
		expect(
			feedbackInputSchema.safeParse({
				kind: "site_issue",
				text: "broken",
				channel: "staff",
				consentContact: false,
			}).success,
		).toBe(true);
	});

	it.each([1, 2, 3, 4, 5])("accepts the rating %i", (n) => {
		expect(problems({ rating: n })).toEqual([]);
	});

	it.each([0, 6, -1, 3.5, Number.NaN])("refuses the rating %s", (n) => {
		expect(problems({ rating: n }).length).toBeGreaterThan(0);
	});

	it("needs a rating or a text; either is enough", () => {
		expect(problems({ kind: "general", rating: undefined })).toEqual(["rating_or_text"]);
		expect(problems({ kind: "general", rating: undefined, text: "hello" })).toEqual([]);
		expect(problems({ kind: "general", rating: 2 })).toEqual([]);
	});

	it("takes a text of exactly 4000 characters and refuses 4001, counting characters not bytes", () => {
		expect(problems({ text: "x".repeat(TEXT_MAX) })).toEqual([]);
		expect(problems({ text: "x".repeat(TEXT_MAX + 1) }).length).toBeGreaterThan(0);
		expect(problems({ text: "ă".repeat(TEXT_MAX) })).toEqual([]);
	});

	it("trims the text and refuses a blank one", () => {
		expect(feedbackInputSchema.parse({ ...rating, text: "  hi  " }).text).toBe("hi");
		expect(problems({ text: "   " }).length).toBeGreaterThan(0);
	});

	it("an appointment rating needs its rating and its appointment", () => {
		expect(problems({ rating: undefined, text: "x" })).toContain("rating_required");
		expect(problems({ visit: undefined })).toContain("appointment_required");
		expect(
			feedbackInputSchema.safeParse({ ...rating, visit: undefined, appointment: "K7M3-9QXA" })
				.success,
		).toBe(true);
	});

	it("staff write about the app, never an appointment rating; a link carries only a rating", () => {
		expect(problems({ channel: "staff" })).toContain("staff_kind");
		expect(
			problems({ channel: "email_link", kind: "general", text: "x", visit: undefined }),
		).toContain("link_kind");
		expect(problems({ channel: "email_link" })).toEqual([]);
	});

	it("contact details only with consent to be contacted, and normalised", () => {
		expect(problems({ contact: { email: "a@x.ro" } })).toContain("consent_required");
		const ok = feedbackInputSchema.parse({
			...rating,
			consentContact: true,
			contact: { email: " A@X.ro ", phone: "0700 000 001" },
		});
		expect(ok.contact).toEqual({ email: "a@x.ro", phone: "+40700000001" });
		expect(
			feedbackInputSchema.safeParse({ ...rating, consentContact: true, contact: { email: "no" } })
				.success,
		).toBe(false);
		expect(
			feedbackInputSchema.safeParse({ ...rating, consentContact: true, contact: { phone: "1" } })
				.success,
		).toBe(false);
		expect(
			feedbackInputSchema.safeParse({ ...rating, consentContact: true, contact: { other: "x" } })
				.success,
		).toBe(false);
	});

	it("refuses an unknown kind or channel", () => {
		expect(feedbackInputSchema.safeParse({ ...rating, kind: "praise" }).success).toBe(false);
		expect(feedbackInputSchema.safeParse({ ...rating, channel: "sms" }).success).toBe(false);
	});

	it("feedbackProblems is the same rule for ciphertext: it only asks whether there is a text", () => {
		expect(
			feedbackProblems({
				kind: "general",
				hasText: true,
				channel: "chat",
				consentContact: false,
				hasContact: false,
			}),
		).toEqual([]);
		expect(
			feedbackProblems({
				kind: "general",
				hasText: false,
				channel: "chat",
				consentContact: false,
				hasContact: false,
			}),
		).toEqual(["rating_or_text"]);
	});
});

describe("replyInputSchema", () => {
	it("takes 1 to 4000 characters", () => {
		expect(replyInputSchema.safeParse({ text: "x" }).success).toBe(true);
		expect(replyInputSchema.safeParse({ text: "x".repeat(TEXT_MAX) }).success).toBe(true);
		expect(replyInputSchema.safeParse({ text: "x".repeat(TEXT_MAX + 1) }).success).toBe(false);
		expect(replyInputSchema.safeParse({ text: "  " }).success).toBe(false);
		expect(replyInputSchema.safeParse({}).success).toBe(false);
	});
});

describe("nextStatus", () => {
	const table: Array<[string, FeedbackEvent, string, boolean | "refused"]> = [
		["new", "read", "read", true],
		["read", "read", "read", false],
		["answered", "read", "answered", false],
		["closed", "read", "closed", false],
		["new", "reply", "answered", true],
		["read", "reply", "answered", true],
		["answered", "reply", "answered", false],
		["closed", "reply", "closed", "refused"],
		["new", "close", "closed", true],
		["read", "close", "closed", true],
		["answered", "close", "closed", true],
		["closed", "close", "closed", "refused"],
		["closed", "reopen", "read", true],
		["new", "reopen", "new", "refused"],
		["read", "reopen", "read", "refused"],
		["answered", "reopen", "answered", "refused"],
	];
	it.each(table)("%s + %s", (from, event, to, changed) => {
		const out = nextStatus(from as (typeof FEEDBACK_STATUSES)[number], event);
		if (changed === "refused") expect(out.ok).toBe(false);
		else expect(out).toEqual({ ok: true, next: to, changed });
	});

	it("covers every status and event", () => {
		expect(table).toHaveLength(FEEDBACK_STATUSES.length * 4);
	});
});

describe("signed feedback links", () => {
	const SERVER = "s".repeat(64);
	const claims = (over: Partial<LinkClaims> = {}): LinkClaims => ({
		a: "psizone",
		j: newLinkId(),
		k: "visit",
		s: "visit-1",
		e: 2_000_000,
		...over,
	});

	it("round-trips the claims", async () => {
		const key = await deriveLinkKey(SERVER);
		const c = claims();
		const out = await verifyLink(key, await signLink(key, c), 1_000_000);
		expect(out).toEqual({ ok: true, claims: c });
	});

	it("expires at the instant itself, not one millisecond before", async () => {
		const key = await deriveLinkKey(SERVER);
		const token = await signLink(key, claims({ e: 5_000 }));
		expect((await verifyLink(key, token, 4_999)).ok).toBe(true);
		expect(await verifyLink(key, token, 5_000)).toEqual({ ok: false, reason: "expired" });
		expect(await verifyLink(key, token, 9_999_999)).toEqual({ ok: false, reason: "expired" });
	});

	it("refuses a token signed with another key, and a token whose payload or signature was touched", async () => {
		const key = await deriveLinkKey(SERVER);
		const other = await deriveLinkKey("t".repeat(64));
		const token = await signLink(key, claims());
		expect(await verifyLink(other, token, 1)).toEqual({ ok: false, reason: "bad_signature" });
		const [payload = "", sig = ""] = token.split(".");
		const forged = await signLink(key, claims({ e: 9_999_999_999 }));
		expect(await verifyLink(key, `${forged.split(".")[0]}.${sig}`, 1)).toEqual({
			ok: false,
			reason: "bad_signature",
		});
		const flipped = `${payload}.${sig.slice(0, -2)}${sig.endsWith("AA") ? "BB" : "AA"}`;
		expect((await verifyLink(key, flipped, 1)).ok).toBe(false);
	});

	it.each([
		"",
		"nodot",
		"a.b.c",
		".",
		"a.",
		".b",
		"not base64!.also not",
		`${"A".repeat(2_000)}.AAAA`,
	])("refuses a malformed token %#", async (token) => {
		const key = await deriveLinkKey(SERVER);
		const out = await verifyLink(key, token, 1);
		expect(out.ok).toBe(false);
		if (!out.ok) expect(["malformed", "bad_signature"]).toContain(out.reason);
	});

	it("a validly signed payload of the wrong shape is malformed, not trusted", async () => {
		const key = await deriveLinkKey(SERVER);
		const body = btoa(JSON.stringify({ a: "x" })).replace(/=+$/, "");
		const sig = new Uint8Array(
			await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
		);
		const sigText = btoa(String.fromCharCode(...sig))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		expect(await verifyLink(key, `${body}.${sigText}`, 1)).toEqual({
			ok: false,
			reason: "malformed",
		});
	});

	it("refuses to sign claims of the wrong shape", async () => {
		const key = await deriveLinkKey(SERVER);
		await expect(signLink(key, claims({ j: "short" }))).rejects.toThrow();
		await expect(signLink(key, claims({ e: -1 }))).rejects.toThrow();
		await expect(signLink(key, claims({ a: "" }))).rejects.toThrow();
	});

	it("fails closed on a short server key", async () => {
		await expect(deriveLinkKey("short")).rejects.toThrow(RangeError);
		await expect(deriveLinkKey("")).rejects.toThrow(RangeError);
	});

	it("link ids are 128 random bits and differ", () => {
		const ids = new Set(Array.from({ length: 200 }, newLinkId));
		expect(ids.size).toBe(200);
		for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
	});

	it("allows lifetimes from one hour to ninety days", () => {
		expect(ttlAllowed(LINK_TTL_MIN_HOURS)).toBe(true);
		expect(ttlAllowed(LINK_TTL_MAX_HOURS)).toBe(true);
		for (const bad of [0, 0.5, LINK_TTL_MAX_HOURS + 1, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(ttlAllowed(bad)).toBe(false);
		}
	});
});
