import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
	w.notifier.sent.length = 0;
});
const owner = (method: string, path: string, body?: unknown) =>
	w.call("olga", method, `${A}${path}`, body);
const events = (): string[] => w.notifier.sent.map((n) => n.event);

async function request(): Promise<{ reference: string; cancelCode: string }> {
	const s = (
		await w.callKey(
			"psizone-web",
			"GET",
			`${A}/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=1`,
		)
	).json.slots as { practitioner: string; start: number }[];
	const hold = (
		await w.callKey("psizone-web", "POST", `${A}/book/holds`, {
			service: "evaluation",
			practitioner: s[0]?.practitioner,
			start: s[0]?.start,
			mode: "onsite",
			locale: "ro",
			channel: "form",
		})
	).json;
	const sub = (
		await w.callKey("psizone-web", "POST", `${A}/book/holds/${hold.reference}/submit`, {
			holdToken: hold.holdToken,
			contact: { name: "V", phone: "0733 000 333" },
		})
	).json;
	return { reference: String(sub.reference), cancelCode: String(sub.cancelCode) };
}

describe("the team and the people are told, by reference and without data", () => {
	it("a callback request tells the team that handles requests", async () => {
		await w.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
			contact: { name: "C", phone: "0733 000 222" },
			locale: "ro",
		});
		expect(w.notifier.sent).toHaveLength(1);
		expect(w.notifier.sent[0]).toMatchObject({
			app: "psizone",
			event: "request.created",
			to: { kind: "team", permission: "web_requests_view" },
		});
	});

	it("a requested slot, its confirmation and its cancellation each tell the right party", async () => {
		const r = await request();
		await owner("POST", `/requests/${r.reference}/decision`, { decision: "confirm" });
		await w.callKey("psizone-web", "POST", `${A}/book/requests/${r.reference}/cancel`, {
			cancelCode: r.cancelCode,
		});
		expect(events()).toEqual([
			"appointment.requested",
			"appointment.confirmed",
			"appointment.cancelled",
		]);
		expect(w.notifier.sent[1]?.to).toEqual({ kind: "request", reference: r.reference });
	});

	it("staff-made appointments tell the client when booked, moved and cancelled", async () => {
		const a = (
			await owner("POST", "/appointments", {
				practitionerId: w.ids.dora,
				clientId: w.ids.c1,
				start: NOW + 50 * HOUR,
				end: NOW + 51 * HOUR,
			})
		).json.id as string;
		await owner("PATCH", `/appointments/${a}`, { start: NOW + 52 * HOUR, end: NOW + 53 * HOUR });
		await owner("PATCH", `/appointments/${a}`, { note: "just a note" });
		await owner("POST", `/appointments/${a}/cancel`, { reason: "client asked" });
		expect(events()).toEqual([
			"appointment.confirmed",
			"appointment.moved",
			"appointment.cancelled",
		]);
		expect(w.notifier.sent.every((n) => n.to.kind === "client")).toBe(true);
	});

	it("a no-show, a payment, leave and a package running low tell the team or the person", async () => {
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "no_show" });
		await owner("POST", `/appointments/${w.ids.a1}/payment`, { amountCents: 100, method: "cash" });
		await owner("POST", `/packages/${w.ids.pkg}/payments`, { amountCents: 100, method: "cash" });
		await w.call("elena", "POST", `${A}/leave`, {
			personId: w.ids.elena,
			from: "2026-12-20",
			to: "2026-12-21",
			kind: "co",
		});
		await owner("POST", `/leave/${w.ids.leave}/decision`, { decision: "approved" });
		expect(events()).toEqual([
			"attendance.no_show",
			"payment.recorded",
			"payment.recorded",
			"leave.requested",
			"leave.decided",
		]);
		expect(w.notifier.sent.at(-1)?.to).toEqual({ kind: "person", subject: "dora" });
	});

	it("a package with two sessions or fewer left tells the team, once per level", async () => {
		await owner("PATCH", `/packages/${w.ids.pkg}`, { sessions: 2, bonus: 0 });
		await owner("PATCH", `/appointments/${w.ids.a1}`, { packageId: w.ids.pkg });
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "attended" });
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "attended" });
		const low = w.notifier.sent.filter((n) => n.event === "package.low");
		expect(low).toHaveLength(1);
		expect(low[0]).toMatchObject({
			payload: { packageId: w.ids.pkg, sessionsRemaining: 1 },
			to: { permission: "packages_view" },
		});
	});

	it("payloads carry ids, counts and states only: no name, contact or clinical text", async () => {
		await request();
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "no_show" });
		const text = JSON.stringify(w.notifier.sent);
		for (const secret of ["Client One", "0733", "synthetic", "example.test", "Visitor"])
			expect(text).not.toContain(secret);
	});

	it("the same action carries the same idempotency key, so a retry sends once", async () => {
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "no_show" });
		await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "no_show" });
		expect(new Set(w.notifier.sent.map((n) => n.idempotencyKey)).size).toBe(w.notifier.sent.length);
		expect(w.notifier.sent.filter((n) => n.event === "attendance.no_show")).toHaveLength(1);
	});

	it("a failed notification never fails the action, and the failure is logged", async () => {
		w.notifier.failing = true;
		const r = await owner("POST", `/appointments/${w.ids.a1}/attendance`, { status: "no_show" });
		expect(r.status).toBe(200);
		expect((await owner("GET", `/appointments/${w.ids.a1}`)).json.status).toBe("no_show");
		expect(w.logs.some((l) => l.event === "notify_failed")).toBe(true);
	});

	it("a refused call tells nobody", async () => {
		await w.call("dora", "POST", `${A}/appointments/${w.ids.a2}/attendance`, { status: "no_show" });
		await w.call(null, "POST", `${A}/book/callback-requests`, {
			contact: { name: "x", phone: "1234567" },
			locale: "ro",
		});
		expect(w.notifier.sent).toEqual([]);
	});
});
