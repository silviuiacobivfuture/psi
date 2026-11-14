import { CONTACT_LIMITS, FIELD_LIMITS } from "@psi/scheduling/domain";
import {
	BOOKING_FIELD_LIMITS,
	BOOKING_FIELD_REFUSALS,
	type BookingFieldRefusal,
} from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { createLimiter } from "./ports/ratelimit";
import type { Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";
import { worldFactories } from "./testing/worlds";

/**
 * A public site's booking through the service (psizone-web's service key, the visitor's address forwarded): the
 * team is notified, the journal records it, the rate limit and the key's app hold, and every booking carries the five
 * fields the sites ask (in their form and in their assistant alike), each refused with its own reason and nothing
 * written.
 */
const A = "/v1/apps/psizone";
const IP = { "x-psi-client-ip": "203.0.113.7" };
const factories = await worldFactories();
let w: Populated;

const site = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
	w.callKey("psizone-web", method, `${A}${path}`, body, { ...IP, ...headers });
const detail = (r: { json: Record<string, unknown> }) =>
	(r.json.error as { code: string; detail?: Record<string, unknown> }).detail ?? {};
const code = (r: { json: Record<string, unknown> }) => (r.json.error as { code: string }).code;

async function held(channel: "form" | "guide" = "form") {
	const slots = (
		await site(
			"GET",
			`/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=5`,
		)
	).json.slots as { practitioner: string; start: number }[];
	const s = slots[0];
	if (s === undefined) throw new Error("no slot");
	const r = await site("POST", "/book/holds", {
		service: "evaluation",
		practitioner: s.practitioner,
		start: s.start,
		mode: "onsite",
		locale: "ro",
		channel,
	});
	expect(r.status).toBe(200);
	return r.json as { reference: string; holdToken: string };
}

const CONTACT = {
	name: "Ana Pop",
	phone: "0733 000 111",
	email: "ana@example.ro",
	age: 9,
	details: "Nu se concentrează la teme de câteva luni.",
};

async function audited(action: string) {
	return (await w.call("olga", "GET", `${A}/audit?action=${action}`)).json.items as {
		actor: { subject: string; kind: string };
		target: { id: string };
	}[];
}

describe("the five fields' bounds", () => {
	it("are the sites' and the store's own: the service never accepts what they would refuse, or the reverse", () => {
		expect(BOOKING_FIELD_LIMITS).toEqual(FIELD_LIMITS);
		expect(BOOKING_FIELD_LIMITS).toMatchObject({
			nameMin: CONTACT_LIMITS.nameMin,
			nameMax: CONTACT_LIMITS.nameMax,
			ageMax: CONTACT_LIMITS.ageMax,
			detailsMin: CONTACT_LIMITS.detailsMin,
			detailsMax: CONTACT_LIMITS.detailsMax,
			emailMax: CONTACT_LIMITS.emailMax,
		});
	});
});

describe.each(factories)("public bookings, on the $name store", (factory) => {
	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(() => factory.cleanup());

	describe("a public booking reaches the team the way every booking does", () => {
		it("a submitted request is journaled as the site's service, and the team is notified of it", async () => {
			const h = await held();
			const sent = w.notifier.sent.length;
			const r = await site("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				contact: CONTACT,
			});
			expect(r.status).toBe(200);
			const reference = String(r.json.reference);
			const events = (await audited("request.create")).filter((e) => e.target.id === reference);
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				actor: { subject: "service:psizone-web", kind: "service" },
				target: { id: reference },
			});
			const told = w.notifier.sent.slice(sent).map((n) => n.event);
			expect(told).toEqual(["request.created", "appointment.requested"]);
			expect(w.notifier.sent.slice(sent).every((n) => n.app === "psizone")).toBe(true);
		});

		it("a cancel with the code is journaled and the team is told", async () => {
			const h = await held();
			const sub = (
				await site("POST", `/book/holds/${h.reference}/submit`, {
					holdToken: h.holdToken,
					contact: CONTACT,
				})
			).json;
			const sent = w.notifier.sent.length;
			const r = await site("POST", `/book/requests/${sub.reference}/cancel`, {
				cancelCode: sub.cancelCode,
			});
			expect(r.status).toBe(200);
			expect((await audited("visitor.cancel")).map((e) => e.target.id)).toContain(sub.reference);
			expect(w.notifier.sent.slice(sent).map((n) => n.event)).toEqual(["appointment.cancelled"]);
		});

		it("a callback request with the time the visitor wanted and the service is taken and journaled", async () => {
			const r = await site("POST", "/book/callback-requests", {
				contact: CONTACT,
				audience: "child",
				locale: "ro",
				preferredStart: NOW + 26 * HOUR,
				service: "evaluation",
			});
			expect(r.status).toBe(200);
			expect((await audited("callback.create")).map((e) => e.target.id)).toContain(
				r.json.reference,
			);
		});

		it("a refused submit writes no journal entry and notifies nobody", async () => {
			const h = await held();
			const before = await w.fingerprint();
			const r = await site("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: "0000-0000-0000-0000",
				contact: CONTACT,
			});
			expect(r.status).toBe(404);
			expect(await w.fingerprint()).toBe(before);
		});
	});

	describe("the site's key and the visitor's address", () => {
		it("a key for another app is refused (403) before anything is read or written", async () => {
			const before = await w.fingerprint();
			const r = await w.callKey(
				"hemisync-web",
				"POST",
				`${A}/book/callback-requests`,
				{ contact: CONTACT, locale: "ro" },
				IP,
			);
			expect(r.status).toBe(403);
			expect(code(r)).toBe("forbidden");
			expect(await w.fingerprint()).toBe(before);
		});

		it("a visitor past the rate is refused (429) and the booking is not written; another address goes on", async () => {
			const h = await held();
			const limiter = w.deps.limiter;
			onTestFinished(() => {
				w.deps.limiter = limiter;
			});
			w.deps.limiter = createLimiter({ capacity: 1, refillPerSecond: 0.001 }, () => w.clock.now);
			expect((await site("GET", "/book/services")).status).toBe(200);
			const before = await w.fingerprint();
			const r = await site("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				contact: CONTACT,
			});
			expect(r.status).toBe(429);
			expect(code(r)).toBe("rate_limited");
			expect(await w.fingerprint()).toBe(before);
			const other = await site(
				"POST",
				`/book/holds/${h.reference}/submit`,
				{ holdToken: h.holdToken, contact: CONTACT },
				{ "x-psi-client-ip": "198.51.100.4" },
			);
			expect(other.status).toBe(200);
		});
	});

	describe("the five booking fields, on the form's booking and the assistant's alike", () => {
		const cases: ReadonlyArray<[BookingFieldRefusal, Record<string, unknown>]> = [
			["name_missing", { ...CONTACT, name: "   " }],
			["name_invalid", { ...CONTACT, name: "A" }],
			["age_missing", { ...CONTACT, age: undefined }],
			["age_invalid", { ...CONTACT, age: 9.5 }],
			["details_missing", { ...CONTACT, details: undefined }],
			["details_invalid", { ...CONTACT, details: "scurt" }],
			["phone_missing", { ...CONTACT, phone: undefined }],
			["phone_invalid", { ...CONTACT, phone: "12" }],
			["email_missing", { ...CONTACT, email: undefined }],
			["email_invalid", { ...CONTACT, email: "ana@" }],
		];

		it("every refusal reason has its case", () => {
			expect(cases.map(([reason]) => reason).sort()).toEqual([...BOOKING_FIELD_REFUSALS].sort());
		});

		for (const channel of ["form", "guide"] as const) {
			for (const [reason, contact] of cases) {
				it(`${channel}, ${reason}: 400 with that reason, nothing written, and the hold still submittable`, async () => {
					const h = await held(channel);
					const before = await w.fingerprint();
					const r = await site("POST", `/book/holds/${h.reference}/submit`, {
						holdToken: h.holdToken,
						contact,
					});
					expect(r.status).toBe(400);
					expect(code(r)).toBe("invalid");
					expect(detail(r)).toMatchObject({ reason, field: reason.slice(0, reason.indexOf("_")) });
					expect(await w.fingerprint()).toBe(before);
					const ok = await site("POST", `/book/holds/${h.reference}/submit`, {
						holdToken: h.holdToken,
						contact: CONTACT,
					});
					expect(ok.status).toBe(200);
				});
			}
		}

		it("all five missing are named together, the first one as the reason", async () => {
			const h = await held("guide");
			const r = await site("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				contact: { name: "" },
			});
			expect(detail(r)).toMatchObject({
				reason: "name_missing",
				fields: ["name", "age", "details", "phone", "email"],
			});
		});

		it("the age and the details are kept with the contact, and never sent to the team's notifications", async () => {
			const h = await held("guide");
			const sent = w.notifier.sent.length;
			const r = await site("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				contact: CONTACT,
			});
			expect(r.status).toBe(200);
			expect(JSON.stringify(w.notifier.sent.slice(sent))).not.toContain(CONTACT.details);
		});
	});
});
