import { GUIDE_FIELD_REFUSALS, type GuideFieldRefusal } from "@psi/scheduling-sdk/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { createLimiter } from "./ports/ratelimit";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

/**
 * A public site's booking through the service (psizone-web's service key, the visitor's address forwarded): the
 * team is notified, the journal records it, the rate limit and the key's app hold, and a booking taken by the visitor
 * assistant carries its five fields, each refused with its own reason and nothing written.
 */
const A = "/v1/apps/psizone";
const IP = { "x-psi-client-ip": "203.0.113.7" };
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});

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

const COMPLETE = {
	contact: { name: "Ana Pop", phone: "0733 000 111", email: "ana@example.ro" },
	age: 9,
	details: "Nu se concentrează la teme.",
};

async function audited(action: string) {
	return (await w.call("olga", "GET", `${A}/audit?action=${action}`)).json.items as {
		actor: { subject: string; kind: string };
		target: { id: string };
	}[];
}

describe("a public booking reaches the team the way every booking does", () => {
	it("a submitted request is journaled as the site's service, and the team is notified of it", async () => {
		const h = await held();
		const sent = w.notifier.sent.length;
		const r = await site("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: { name: "V", phone: "0733 000 111" },
		});
		expect(r.status).toBe(200);
		const reference = String(r.json.reference);
		const events = await audited("request.create");
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
				contact: { name: "V", phone: "0733 000 111" },
			})
		).json;
		const sent = w.notifier.sent.length;
		const r = await site("POST", `/book/requests/${sub.reference}/cancel`, {
			cancelCode: sub.cancelCode,
		});
		expect(r.status).toBe(200);
		expect((await audited("visitor.cancel")).map((e) => e.target.id)).toEqual([sub.reference]);
		expect(w.notifier.sent.slice(sent).map((n) => n.event)).toEqual(["appointment.cancelled"]);
	});

	it("a callback request keeps the time the visitor wanted and the service, and is journaled", async () => {
		const r = await site("POST", "/book/callback-requests", {
			contact: { name: "V", phone: "0733 000 111" },
			audience: "adult",
			locale: "ro",
			preferredStart: NOW + 26 * HOUR,
			service: "evaluation",
		});
		expect(r.status).toBe(200);
		expect((await audited("callback.create")).map((e) => e.target.id)).toEqual([r.json.reference]);
		expect(await w.dump()).toContain(String(NOW + 26 * HOUR));
	});

	it("a refused submit writes no journal entry and notifies nobody", async () => {
		const h = await held();
		const before = await w.fingerprint();
		const r = await site("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: "0000-0000-0000-0000",
			contact: { name: "V", phone: "0733 000 111" },
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
			{ contact: { name: "V", phone: "0733 000 111" }, locale: "ro" },
			IP,
		);
		expect(r.status).toBe(403);
		expect(code(r)).toBe("forbidden");
		expect(await w.fingerprint()).toBe(before);
	});

	it("a visitor past the rate is refused (429) and the booking is not written; another address goes on", async () => {
		const h = await held();
		w.deps.limiter = createLimiter({ capacity: 1, refillPerSecond: 0.001 }, () => w.clock.now);
		expect((await site("GET", "/book/services")).status).toBe(200);
		const before = await w.fingerprint();
		const r = await site("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: { name: "V", phone: "0733 000 111" },
		});
		expect(r.status).toBe(429);
		expect(code(r)).toBe("rate_limited");
		expect(await w.fingerprint()).toBe(before);
		const other = await site(
			"POST",
			`/book/holds/${h.reference}/submit`,
			{ holdToken: h.holdToken, contact: { name: "V", phone: "0733 000 111" } },
			{ "x-psi-client-ip": "198.51.100.4" },
		);
		expect(other.status).toBe(200);
	});
});

describe("the visitor assistant's five fields", () => {
	const cases: ReadonlyArray<[GuideFieldRefusal, Record<string, unknown>]> = [
		["name_missing", { ...COMPLETE, contact: { ...COMPLETE.contact, name: "   " } }],
		["name_invalid", { ...COMPLETE, contact: { ...COMPLETE.contact, name: "A" } }],
		["age_missing", { contact: COMPLETE.contact, details: COMPLETE.details }],
		["age_invalid", { ...COMPLETE, age: 9.5 }],
		["details_missing", { contact: COMPLETE.contact, age: COMPLETE.age }],
		["details_invalid", { ...COMPLETE, details: "ok" }],
		["phone_missing", { ...COMPLETE, contact: { name: "Ana Pop", email: "ana@example.ro" } }],
		["phone_invalid", { ...COMPLETE, contact: { ...COMPLETE.contact, phone: "12" } }],
		["email_missing", { ...COMPLETE, contact: { name: "Ana Pop", phone: "0733 000 111" } }],
		["email_invalid", { ...COMPLETE, contact: { ...COMPLETE.contact, email: "ana@" } }],
	];

	it("every refusal reason has its case", () => {
		expect(cases.map(([reason]) => reason).sort()).toEqual([...GUIDE_FIELD_REFUSALS].sort());
	});

	for (const [reason, body] of cases) {
		it(`${reason}: 400 with that reason, nothing written, and the hold still submittable`, async () => {
			const h = await held("guide");
			const before = await w.fingerprint();
			const r = await site("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				channel: "guide",
				...body,
			});
			expect(r.status).toBe(400);
			expect(code(r)).toBe("invalid");
			expect(detail(r)).toMatchObject({ reason, field: reason.slice(0, reason.indexOf("_")) });
			expect(await w.fingerprint()).toBe(before);
			const ok = await site("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				channel: "guide",
				...COMPLETE,
			});
			expect(ok.status).toBe(200);
		});
	}

	it("all five missing are named together, the first one as the reason", async () => {
		const h = await held("guide");
		const r = await site("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			channel: "guide",
			contact: { name: "" },
		});
		expect(detail(r)).toMatchObject({
			reason: "name_missing",
			fields: ["name", "age", "details", "phone", "email"],
		});
	});

	it("the five fields are the assistant's: the form's booking needs a name and one way to call back only", async () => {
		const h = await held();
		const r = await site("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: { name: "Ana Pop", phone: "0733 000 111" },
		});
		expect(r.status).toBe(200);
	});

	it("the form's booking with an empty name is refused as an invalid body, and nothing is written", async () => {
		const h = await held();
		const before = await w.fingerprint();
		const r = await site("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: { name: "  ", phone: "0733 000 111" },
		});
		expect(r.status).toBe(400);
		expect(detail(r)).toEqual({ fields: ["contact.name"] });
		expect(await w.fingerprint()).toBe(before);
	});

	it("the age and the problem are checked and never stored", async () => {
		const h = await held("guide");
		const r = await site("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			channel: "guide",
			...COMPLETE,
		});
		expect(r.status).toBe(200);
		expect(await w.dump()).not.toContain(COMPLETE.details);
		expect(JSON.stringify(w.notifier.sent)).not.toContain(COMPLETE.details);
	});
});
