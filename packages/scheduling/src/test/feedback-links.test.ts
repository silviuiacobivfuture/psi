import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { deriveLinkKey, newLinkId, signLink } from "../clinic/feedback-link";
import { backendReady, runMutation } from "./admin";
import { DAY, enc, HOUR, id, n } from "./api-harness";
import { clinicWorld } from "./clinic-world";
import { callMutation, serverKey } from "./server";

/**
 * The one-time feedback links against the local backend, in throwaway `test-fbl-…` apps: issue,
 * inspect, redeem; each refusal its own case and asserting nothing was written; a link works once
 * even when ten submissions race for it. Synthetic data.
 */
if (!backendReady) console.warn("feedback-links.test: no local backend; see README");

const w = clinicWorld("fbl");
const { a, b, ref, state } = w;
const past = Date.now() - 20 * DAY;

describe.skipIf(!backendReady)("feedback links", () => {
	let t = 0;
	const visit = async (client = ref("ion"), over: Record<string, unknown> = {}) => {
		t += 1;
		const start = past + t * DAY;
		return id(
			await a.mut("apiVisits:create", {
				column: { kind: "practitioner", id: state.practitioner },
				start,
				end: start + HOUR,
				sessionType: "ABA",
				client,
				...over,
			}),
		);
	};
	const issue = async (subject: string, extra: Record<string, unknown> = {}) =>
		String((await a.mut("feedbackLinks:issue", { visit: subject, ...extra })).token);
	const redeem = (
		token: string,
		extra: Record<string, unknown> = {},
		e: { audit?: number; ok?: boolean; same?: boolean } = {},
	) => a.sys("feedbackLinks:redeem", { token, rating: 5, consentContact: false, ...extra }, e);
	const forge = async (over: Record<string, unknown>) =>
		signLink(await deriveLinkKey(serverKey), {
			a: a.TENANT,
			j: newLinkId(),
			k: "visit",
			s: "x",
			e: Date.now() + HOUR,
			...over,
		});

	beforeAll(async () => {
		if (backendReady) await w.setup();
	});
	afterAll(async () => {
		if (backendReady) await w.teardown();
	});

	describe("issuing", () => {
		it("makes a signed token that expires in fourteen days, audited once", async () => {
			const out = await a.mut("feedbackLinks:issue", { visit: await visit() });
			expect(String(out.token)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
			const left = Number(out.expiresAt) - Date.now();
			expect(Math.abs(left - 14 * 24 * HOUR)).toBeLessThan(60_000);
		});

		it("takes a lifetime from one hour to ninety days", async () => {
			const subject = await visit();
			const hour = await a.mut("feedbackLinks:issue", { visit: subject, ttlHours: 1 });
			expect(Math.abs(Number(hour.expiresAt) - Date.now() - HOUR)).toBeLessThan(60_000);
			await a.mut("feedbackLinks:issue", { visit: subject, ttlHours: 90 * 24 });
		});

		it.each([
			["a lifetime of zero", { ttlHours: 0 }, "invalid_ttl"],
			["a lifetime past ninety days", { ttlHours: 90 * 24 + 1 }, "invalid_ttl"],
			["a visit and a booking together", { appointment: "ZZZZ-ZZZZ" }, "invalid"],
			["a visit of no app", { visit: "nope" }, "not_found"],
		])("refuses %s and writes nothing", async (_label, extra, reason) => {
			const out = await a.mut(
				"feedbackLinks:issue",
				{ visit: await visit(), ...extra },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe(reason);
		});

		it("refuses neither a visit nor a booking, writing nothing", async () => {
			const out = await a.mut("feedbackLinks:issue", {}, { audit: 0, ok: false, same: true });
			expect(out.reason).toBe("invalid");
		});

		it("refuses a visit still to come, an absent one and a cancelled one, writing nothing", async () => {
			const future = await visit(undefined, {
				start: Date.now() + 3 * DAY,
				end: Date.now() + 3 * DAY + HOUR,
			});
			const absent = await visit();
			await a.mut("apiVisits:setAttendance", { visit: absent, attendance: "absent" });
			const cancelled = await visit();
			await a.mut("apiVisits:cancel", { visit: cancelled });
			for (const subject of [future, absent, cancelled]) {
				const out = await a.mut(
					"feedbackLinks:issue",
					{ visit: subject },
					{ audit: 0, ok: false, same: true },
				);
				expect(out.reason, subject).toBe("not_eligible");
			}
		});

		it("refuses another app's visit", async () => {
			const out = await b.mut(
				"feedbackLinks:issue",
				{ visit: await visit() },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe("not_found");
		});
	});

	describe("a public booking that took place", () => {
		const reference = "PAST-0001";

		it("is rated from its reference, once; a link for it is issued by reference and redeemed once", async () => {
			await runMutation(
				"seed:pastBooking",
				{ tenant: a.TENANT, reference, daysAgo: 3.37 },
				z.unknown(),
			);
			const rated = await a.sys(
				"apiFeedback:submit",
				{
					channel: "chat",
					kind: "appointment_rating",
					rating: 4,
					appointment: reference,
					consentContact: false,
				},
				{ audit: 1 },
			);
			const got = await a.qry("apiFeedback:get", { feedback: String(rated.id), groups: [] });
			expect(got.item).toHaveProperty("appointment");
			const again = await a.sys(
				"apiFeedback:submit",
				{
					channel: "chat",
					kind: "appointment_rating",
					rating: 1,
					appointment: reference,
					consentContact: false,
				},
				{ audit: 0, ok: false, same: true },
			);
			expect(again.reason).toBe("already_rated");
		});

		it("a link by reference redeems into a rating of that booking", async () => {
			const other = "PAST-0002";
			await runMutation(
				"seed:pastBooking",
				{ tenant: a.TENANT, reference: other, daysAgo: 2.41 },
				z.unknown(),
			);
			const issued = await a.mut("feedbackLinks:issue", { appointment: other });
			const token = String(issued.token);
			expect(await a.qry("feedbackLinks:inspect", { token })).toMatchObject({ ok: true });
			const out = await redeem(token, { rating: 2 }, { audit: 1 });
			const got = await a.qry("apiFeedback:get", { feedback: String(out.id), groups: ["core"] });
			expect(got.item).toMatchObject({
				kind: "appointment_rating",
				channel: "email_link",
				rating: 2,
			});
			expect((await redeem(token, {}, { audit: 0, ok: false, same: true })).reason).toBe("used");
		});

		it("refuses a reference of no booking and of another app", async () => {
			for (const reference of ["NONE-0000", "PAST-0001"]) {
				const tenant = reference === "NONE-0000" ? a : b;
				const out = await tenant.mut(
					"feedbackLinks:issue",
					{ appointment: reference },
					{ audit: 0, ok: false, same: true },
				);
				expect(out.reason).toBe("not_found");
			}
		});
	});

	describe("a public booking still to come", () => {
		it("is not ratable and gets no link", async () => {
			const reference = "FUTR-0001";
			await runMutation(
				"seed:pastBooking",
				{ tenant: a.TENANT, reference, daysAgo: -2.23 },
				z.unknown(),
			);
			const link = await a.mut(
				"feedbackLinks:issue",
				{ appointment: reference },
				{ audit: 0, ok: false, same: true },
			);
			expect(link.reason).toBe("not_eligible");
			const rated = await a.sys(
				"apiFeedback:submit",
				{
					channel: "chat",
					kind: "appointment_rating",
					rating: 5,
					appointment: reference,
					consentContact: false,
				},
				{ audit: 0, ok: false, same: true },
			);
			expect(rated.reason).toBe("not_eligible");
		});
	});

	describe("inspecting and redeeming", () => {
		it("inspect says a link is good, and writes nothing", async () => {
			const token = await issue(await visit());
			const out = await a.qry("feedbackLinks:inspect", { token });
			expect(out).toMatchObject({ ok: true });
			expect(out).not.toHaveProperty("client");
		});

		it("redeeming stores the rating on the visit and its client, by the link channel, and uses the link up", async () => {
			const subject = await visit();
			const token = await issue(subject);
			const before = await a.counts();
			const out = await redeem(token, { rating: 4, textEnc: enc }, { audit: 1 });
			const after = await a.counts();
			expect(n(after, "feedback") - n(before, "feedback")).toBe(1);
			const got = await a.qry("apiFeedback:get", { feedback: String(out.id), groups: ["core"] });
			expect(got.item).toMatchObject({
				kind: "appointment_rating",
				channel: "email_link",
				rating: 4,
				visit: subject,
				client: ref("ion"),
			});
			const again = await redeem(token, {}, { audit: 0, ok: false, same: true });
			expect(again.reason).toBe("used");
			expect((await a.qry("feedbackLinks:inspect", { token }, { ok: false })).reason).toBe("used");
		});

		it("a rating that breaks a rule does not use the link up", async () => {
			const token = await issue(await visit());
			const bad = await redeem(token, { rating: 9 }, { audit: 0, ok: false, same: true });
			expect(bad.reason).toBe("invalid");
			const none = await redeem(token, { rating: undefined }, { audit: 0, ok: false, same: true });
			expect(none.reason).toBe("invalid");
			const tooLong = await redeem(
				token,
				{ textEnc: { ...enc, data: "A".repeat(24_001) } },
				{ audit: 0, ok: false, same: true },
			);
			expect(tooLong.reason).toBe("too_long");
			expect((await redeem(token)).ok).toBe(true);
		});

		it("a second link for a visit already rated is refused and keeps working until used elsewhere", async () => {
			const subject = await visit();
			const first = await issue(subject);
			const second = await issue(subject);
			expect((await redeem(first)).ok).toBe(true);
			const out = await redeem(second, {}, { audit: 0, ok: false, same: true });
			expect(out.reason).toBe("already_rated");
		});

		it("refuses a token for another app", async () => {
			const token = await issue(await visit());
			const out = await b.sys(
				"feedbackLinks:redeem",
				{ token, rating: 5, consentContact: false },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe("wrong_app");
			expect((await b.qry("feedbackLinks:inspect", { token }, { ok: false })).reason).toBe(
				"wrong_app",
			);
		});

		it("refuses a token that was tampered with, one signed by someone else, and one that is not a token", async () => {
			const token = await issue(await visit());
			const [payload = "", sig = ""] = token.split(".");
			const other = await forge({});
			for (const bad of [
				`${payload}.${sig.slice(0, -3)}AAA`,
				`${other.split(".")[0]}.${sig}`,
				"garbage",
				"",
				"a.b.c",
			]) {
				const out = await redeem(bad, {}, { audit: 0, ok: false, same: true });
				expect(out.reason, bad).toBe("invalid_link");
			}
			const strangerKey = await crypto.subtle.importKey(
				"raw",
				new TextEncoder().encode("z".repeat(64)),
				{ name: "HMAC", hash: "SHA-256" },
				false,
				["sign"],
			);
			const forged = `${payload}.${btoa(
				String.fromCharCode(
					...new Uint8Array(
						await crypto.subtle.sign("HMAC", strangerKey, new TextEncoder().encode(payload)),
					),
				),
			)
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "")}`;
			expect((await redeem(forged, {}, { audit: 0, ok: false, same: true })).reason).toBe(
				"invalid_link",
			);
		});

		it("refuses a correctly signed token that has expired, and one the store never issued", async () => {
			const expired = await forge({ e: Date.now() - 1 });
			expect((await redeem(expired, {}, { audit: 0, ok: false, same: true })).reason).toBe(
				"expired",
			);
			const unknown = await forge({ s: await visit() });
			expect((await redeem(unknown, {}, { audit: 0, ok: false, same: true })).reason).toBe(
				"invalid_link",
			);
		});

		it("refuses a link whose visit was erased with its client", async () => {
			const person = id(
				await a.mut("apiClients:create", {
					client: { ...w.person, name: "Test Leaver", phone: "0700 333 333" },
				}),
			);
			const token = await issue(await visit(person));
			await a.mut("staffClients:eraseClient", { client: person }, { audit: 1 });
			expect((await redeem(token, {}, { audit: 0, ok: false, same: true })).reason).toBe(
				"subject_gone",
			);
		});

		it("ten submissions racing for one link store exactly one feedback", async () => {
			const token = await issue(await visit());
			const before = await a.counts();
			const results = await Promise.all(
				Array.from({ length: 10 }, () =>
					callMutation("feedbackLinks:redeem", {
						tenant: a.TENANT,
						token,
						rating: 5,
						consentContact: false,
					}),
				),
			);
			const ok = results.filter((r) => z.object({ ok: z.literal(true) }).safeParse(r).success);
			expect(ok).toHaveLength(1);
			expect(
				results
					.filter((r) => !ok.includes(r))
					.every((r) => z.object({ reason: z.literal("used") }).safeParse(r).success),
			).toBe(true);
			const after = await a.counts();
			expect(n(after, "feedback") - n(before, "feedback")).toBe(1);
		});
	});
});
