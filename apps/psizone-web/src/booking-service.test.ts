import { decodeSlot, SchedulingUnavailable } from "@psi/scheduling";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { createVisitorScheduling, readSchedulingApiEnv, type VisitorScheduling } from "@psi/ui";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The site's scheduling over the real scheduling service (apps/scheduling-api in-process, on a real port, with the
 * site's own service key): the shapes the forms branch on, the visitor's address forwarded, and the team told.
 */
let api: RunningApi;
let s: VisitorScheduling;
const DAY = 86_400_000;
/** The five booking fields, as the form and the chat both send them. */
const VISITOR = {
	name: "Test Vizitator",
	phone: "+40712345678",
	email: "test.vizitator@example.ro",
	age: 34,
	details: "Aș vrea o evaluare, de câteva luni nu dorm bine.",
};
const config = () => ({
	url: api.url,
	serviceKey: api.serviceKey("psizone-web"),
	timeoutMs: 5_000,
});

beforeAll(async () => {
	api = await startApi();
	api.world.clock.now = Date.now();
	s = createVisitorScheduling(config(), "psizone");
});
afterAll(() => api.close());

async function firstSlot() {
	const found = await s.findSlots({
		tenant: "psizone",
		service: "evaluation",
		from: Date.now(),
		to: Date.now() + 14 * DAY,
		limit: 20,
	});
	if (!found.ok) throw new Error(found.reason);
	const slot = found.slots[0];
	if (slot === undefined) throw new Error("no slot");
	return slot;
}

async function hold() {
	const slot = await firstSlot();
	const held = await s.hold({
		tenant: "psizone",
		service: "evaluation",
		practitioner: slot.practitioner,
		start: slot.start,
		mode: "onsite",
		locale: "ro",
		channel: "form",
	});
	if (!held.ok) throw new Error(held.reason);
	return { ...held, practitioner: slot.practitioner };
}

describe("the environment", () => {
	it("is off without a URL, says what is missing, and never takes a bare secret for a key", () => {
		expect(readSchedulingApiEnv({})).toEqual({ ok: false, problem: "no_url" });
		expect(readSchedulingApiEnv({ SCHEDULING_API_URL: "http://x.svc" })).toEqual({
			ok: false,
			problem: "no_key",
		});
		expect(
			readSchedulingApiEnv({
				SCHEDULING_API_URL: "http://x.svc",
				SCHEDULING_SERVICE_KEY: "a".repeat(64),
			}),
		).toEqual({ ok: false, problem: "invalid" });
		expect(
			readSchedulingApiEnv({
				SCHEDULING_API_URL: "not a url",
				SCHEDULING_SERVICE_KEY: "psizone-web.secret-0001-x",
			}),
		).toEqual({ ok: false, problem: "invalid" });
		expect(
			readSchedulingApiEnv({
				SCHEDULING_API_URL: "http://x.svc",
				SCHEDULING_SERVICE_KEY: "psizone-web.secret-0001-x",
			}),
		).toEqual({
			ok: true,
			config: { url: "http://x.svc", serviceKey: "psizone-web.secret-0001-x", timeoutMs: 2_500 },
		});
	});
});

describe("the visitor side, against the service", () => {
	it("lists the services, and an app the key does not reach is not answered as if it had none", async () => {
		const out = await s.services("psizone");
		expect(out?.services.map((x) => x.slug)).toContain("evaluation");
		await expect(s.services("hemisync")).rejects.toBeInstanceOf(SchedulingUnavailable);
	});

	it("free times carry slot ids the forms decode, and an unknown service is unknown_service", async () => {
		const slot = await firstSlot();
		expect(decodeSlot(slot.id)).toMatchObject({
			practitioner: slot.practitioner,
			start: slot.start,
		});
		expect(
			await s.findSlots({
				tenant: "psizone",
				service: "ghost",
				from: Date.now(),
				to: Date.now() + DAY,
			}),
		).toEqual({ ok: false, reason: "unknown_service" });
	});

	it("a hold, then a second hold of the same time is slot_taken", async () => {
		const held = await hold();
		const again = await s.hold({
			tenant: "psizone",
			service: "evaluation",
			practitioner: held.practitioner,
			start: held.start,
			mode: "onsite",
			locale: "ro",
			channel: "form",
		});
		expect(again).toEqual({ ok: false, reason: "slot_taken" });
		expect(await s.release({ reference: held.reference, holdToken: held.holdToken })).toEqual({
			ok: true,
		});
		expect(await s.release({ reference: held.reference, holdToken: held.holdToken })).toEqual({
			ok: false,
			reason: "not_found",
		});
	});

	it("a submitted request reaches the team (notified, journaled) and belongs to the signed-in visitor", async () => {
		const held = await hold();
		const sent = api.world.notifier.sent.length;
		const wrong = await s.submit({
			reference: held.reference,
			holdToken: "0000-0000-0000-0000",
			contact: VISITOR,
		});
		expect(wrong).toEqual({ ok: false, reason: "not_found" });
		// A booking without one of the five fields is the service's refusal, which the forms show as invalid.
		const { details: _d, ...partial } = VISITOR;
		expect(
			await s.submit({ reference: held.reference, holdToken: held.holdToken, contact: partial }),
		).toEqual({ ok: false, reason: "invalid" });
		const sub = await s.submit({
			reference: held.reference,
			holdToken: held.holdToken,
			contact: VISITOR,
			audience: "child",
			subject: "visitor-site-1",
		});
		if (!sub.ok) throw new Error(sub.reason);
		expect(sub.reference).toBe(held.reference);
		expect(api.world.notifier.sent.slice(sent).map((n) => n.event)).toEqual([
			"request.created",
			"appointment.requested",
		]);
		const journal = await api.world.call(
			"olga",
			"GET",
			"/v1/apps/psizone/audit?action=request.create",
		);
		expect((journal.json.items as { target: { id: string } }[]).map((e) => e.target.id)).toContain(
			sub.reference,
		);
		const mine = await api.world.call("visitor-site-1", "GET", "/v1/apps/psizone/me/appointments");
		expect((mine.json.items as { reference: string }[]).map((r) => r.reference)).toEqual([
			sub.reference,
		]);
		expect(await s.cancel({ reference: sub.reference, cancelCode: "WRONG-CODE-0000" })).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect(await s.cancel({ reference: sub.reference, cancelCode: sub.cancelCode })).toMatchObject({
			ok: true,
			start: sub.start,
		});
		expect(await s.cancel({ reference: "x", cancelCode: "y" })).toEqual({
			ok: false,
			reason: "not_found",
		});
	});

	it("the e-mail the visitor's sign-in vouches for goes with their request: one client of that e-mail is linked, otherwise the team is asked", async () => {
		let n = 0;
		const client = async (): Promise<{ id: string; email: string }> => {
			n += 1;
			const email = `vouched-${n}-${Date.now()}@example.test`;
			const made = await api.world.call("olga", "POST", "/v1/apps/psizone/clients", {
				name: `Vouched Client ${n}`,
				contact: { email },
			});
			return { id: String(made.json.id), email };
		};
		const book = async (input: { subject?: string; verifiedEmail?: string; email: string }) => {
			const held = await hold();
			const sub = await s.submit({
				reference: held.reference,
				holdToken: held.holdToken,
				// A phone no client has: the e-mail alone decides (the populated clinic has a client with VISITOR's phone).
				contact: { ...VISITOR, email: input.email, phone: "+40799000777" },
				...(input.subject === undefined ? {} : { subject: input.subject }),
				...(input.verifiedEmail === undefined ? {} : { verifiedEmail: input.verifiedEmail }),
			});
			if (!sub.ok) throw new Error(sub.reason);
		};
		const linkOf = (id: string) => api.world.store.keyed.get("psizone", "link", `c/${id}`);
		const waiting = async () =>
			(
				(await api.world.call("olga", "GET", "/v1/apps/psizone/account-links")).json.items as {
					candidates: { clientId: string }[];
				}[]
			).flatMap((x) => x.candidates.map((c) => c.clientId));

		const vouched = await client();
		await book({
			subject: "visitor-vouched-1",
			verifiedEmail: vouched.email,
			email: vouched.email,
		});
		expect(await linkOf(vouched.id)).toBeDefined();
		expect(await waiting()).not.toContain(vouched.id);

		const unvouched = await client();
		await book({ subject: "visitor-vouched-2", email: unvouched.email });
		expect(await linkOf(unvouched.id)).toBeUndefined();
		expect(await waiting()).toContain(unvouched.id);

		// Without a signed-in visitor there is nobody to vouch for: the e-mail is not sent, nothing is linked or asked.
		const anonymous = await client();
		await book({ verifiedEmail: anonymous.email, email: anonymous.email });
		expect(await linkOf(anonymous.id)).toBeUndefined();
		expect(await waiting()).not.toContain(anonymous.id);
	});

	it("a callback request is stored with the time and service; without consent nothing is sent", async () => {
		const request = {
			tenant: "psizone",
			contact: VISITOR,
			audience: "adult" as const,
			when: "any" as const,
			preferredStart: Date.now() + DAY,
			service: "evaluation",
			locale: "ro" as const,
			channel: "form" as const,
			page: "/contact",
		};
		const before = await api.world.fingerprint();
		expect(await s.requestCallback({ ...request, consent: false })).toEqual({
			ok: false,
			reason: "no_consent",
		});
		expect(await api.world.fingerprint()).toBe(before);
		const out = await s.requestCallback({ ...request, consent: true });
		expect(out.ok).toBe(true);
		expect(await api.world.dump()).toContain(String(request.preferredStart));
	});
});

describe("what the service cannot answer", () => {
	it("an unreachable service, and a key it refuses, are SchedulingUnavailable (the forms fall back)", async () => {
		const down = createVisitorScheduling({ ...config(), url: "http://127.0.0.1:9" }, "psizone");
		await expect(down.services("psizone")).rejects.toBeInstanceOf(SchedulingUnavailable);
		const forged = createVisitorScheduling(
			{ ...config(), serviceKey: "psizone-web.not-the-secret-0000" },
			"psizone",
		);
		await expect(forged.services("psizone")).rejects.toBeInstanceOf(SchedulingUnavailable);
	});

	it("forwards each visitor's address: one visitor past the rate is refused, another is not", async () => {
		const { createLimiter } = await import("@psi/scheduling-api/ratelimit");
		api.world.deps.limiter = createLimiter({ capacity: 1, refillPerSecond: 0.001 }, () =>
			Date.now(),
		);
		const site = new Hono();
		site.use(contextStorage());
		site.get("/", async (c) => {
			try {
				await s.services("psizone");
				return c.text("ok");
			} catch {
				return c.text("unavailable");
			}
		});
		const visit = async (ip: string) =>
			(await site.request("/", { headers: { "x-real-ip": ip } })).text();
		expect(await visit("203.0.113.7")).toBe("ok");
		expect(await visit("203.0.113.7")).toBe("unavailable");
		expect(await visit("198.51.100.4")).toBe("ok");
	});
});
