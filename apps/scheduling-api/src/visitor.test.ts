import { beforeEach, describe, expect, it } from "vitest";
import { createConvexStore } from "./store/convex";
import { StoreUnavailable } from "./store/types";
import { createWorld, type Populated } from "./testing/populate";
import { bookingContact, HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const key = (method: string, path: string, body?: unknown, subject?: string) =>
	w.callKey(
		"psizone-web",
		method,
		`${A}${path}`,
		body,
		subject === undefined ? {} : { "x-psi-subject": subject },
	);
const err = (r: { json: Record<string, unknown> }) => (r.json.error as { code: string }).code;

async function slot(i = 0) {
	const s = (
		await key(
			"GET",
			`/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=10`,
		)
	).json.slots as { practitioner: string; start: number }[];
	const found = s[i];
	if (found === undefined) throw new Error("no slot");
	return found;
}
const hold = async (s: { practitioner: string; start: number }) =>
	key("POST", "/book/holds", {
		service: "evaluation",
		practitioner: s.practitioner,
		start: s.start,
		mode: "onsite",
		locale: "ro",
		channel: "form",
	});

describe("the visitor flow", () => {
	it("offers slots on the service grid, only in the practitioners' hours and never in the past", async () => {
		const slots = (
			await key("GET", `/book/slots?service=evaluation&from=${NOW}&to=${NOW + 5 * 24 * HOUR}`)
		).json.slots as { start: number }[];
		expect(slots.length).toBeGreaterThan(0);
		for (const s of slots) {
			expect(s.start).toBeGreaterThan(NOW);
			const day = new Date(s.start).getUTCDay();
			expect(day).not.toBe(0);
			expect(day).not.toBe(6);
		}
	});

	it("an unknown service is a 404 and a bad window a 400", async () => {
		expect(
			(await key("GET", `/book/slots?service=ghost&from=${NOW}&to=${NOW + HOUR}`)).status,
		).toBe(404);
		expect((await key("GET", "/book/slots?service=evaluation&from=x&to=1")).status).toBe(400);
	});

	it("a hold takes the slot away from everyone else, and a second hold of it is slot_taken", async () => {
		const s = await slot();
		expect((await hold(s)).status).toBe(200);
		const again = await hold(s);
		expect(again.status).toBe(409);
		expect(err(again)).toBe("slot_taken");
		const left = (
			await key(
				"GET",
				`/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=200`,
			)
		).json.slots as { practitioner: string; start: number }[];
		expect(left.some((x) => x.practitioner === s.practitioner && x.start === s.start)).toBe(false);
	});

	it("a lapsed hold cannot be submitted, and frees the slot", async () => {
		const s = await slot(6);
		const h = (await hold(s)).json;
		w.clock.now += 11 * 60_000;
		const r = await key("POST", `/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: bookingContact({ phone: "0733 000 111" }),
		});
		expect(r.status).toBe(410);
		expect(err(r)).toBe("hold_expired");
		expect((await hold(s)).status).toBe(200);
	});

	it("submit needs the hold token and a way to call back; the cancel code is shown once and works once", async () => {
		const h = (await hold(await slot())).json;
		expect(
			(
				await key("POST", `/book/holds/${h.reference}/submit`, {
					holdToken: "0000-0000-0000-0000",
					contact: bookingContact({ phone: "0733 000 111" }),
				})
			).status,
		).toBe(404);
		expect(
			(
				await key("POST", `/book/holds/${h.reference}/submit`, {
					holdToken: h.holdToken,
					contact: { name: "V" },
				})
			).status,
		).toBe(400);
		const sub = (
			await key("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				contact: bookingContact({ phone: "0733 000 111" }),
			})
		).json;
		expect(
			(
				await key("POST", `/book/holds/${h.reference}/submit`, {
					holdToken: h.holdToken,
					contact: bookingContact({ phone: "0733 000 111" }),
				})
			).status,
		).toBe(404);
		expect(
			(
				await key("POST", `/book/requests/${sub.reference}/cancel`, {
					cancelCode: "WRONG-CODE-0000",
				})
			).status,
		).toBe(404);
		expect(
			(await key("POST", `/book/requests/${sub.reference}/cancel`, { cancelCode: sub.cancelCode }))
				.status,
		).toBe(200);
		expect(
			(await key("POST", `/book/requests/${sub.reference}/cancel`, { cancelCode: sub.cancelCode }))
				.status,
		).toBe(404);
	});

	it("the store keeps only a hash of the cancel code and of the hold token", async () => {
		const h = (await hold(await slot())).json;
		const sub = (
			await key("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				contact: bookingContact({ phone: "0733 000 111" }),
			})
		).json;
		expect(await w.dump()).not.toContain(String(sub.cancelCode));
		expect(await w.dump()).not.toContain(String(h.holdToken));
	});

	it("a released hold frees the slot", async () => {
		const s = await slot();
		const h = (await hold(s)).json;
		expect(
			(await key("POST", `/book/holds/${h.reference}/release`, { holdToken: h.holdToken })).status,
		).toBe(200);
		expect((await hold(s)).status).toBe(200);
	});

	it("a hold on a slot a staff visit already takes is refused (staff visits block the public flow)", async () => {
		const s = await slot();
		await w.call("olga", "POST", `${A}/appointments`, {
			practitionerId: s.practitioner,
			clientId: w.ids.c1,
			start: s.start,
			end: s.start + HOUR,
		});
		expect(err(await hold(s))).toBe("slot_taken");
	});

	it("the visitor's own appointments are theirs by subject: a token holder sees theirs, a service key names the visitor", async () => {
		const h = (await hold(await slot())).json;
		await w.call("visitor-9", "POST", `${A}/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: bookingContact({ phone: "0733 000 111" }),
		});
		const mine = await w.call("visitor-9", "GET", `${A}/me/appointments`);
		expect((mine.json.items as unknown[]).length).toBe(1);
		expect(
			((await w.call("visitor-8", "GET", `${A}/me/appointments`)).json.items as unknown[]).length,
		).toBe(0);
		expect(
			((await key("GET", "/me/appointments", undefined, "visitor-9")).json.items as unknown[])
				.length,
		).toBe(1);
		// a bearer token holder cannot pose as someone else with the header
		expect(
			(
				(
					await w.call("visitor-8", "GET", `${A}/me/appointments`, undefined, {
						headers: { "x-psi-subject": "visitor-9" },
					})
				).json.items as unknown[]
			).length,
		).toBe(0);
		expect((await key("GET", "/me/appointments")).status).toBe(400);
	});

	it("a visitor cancels only their own, and a request of someone else is not found", async () => {
		// A slot well ahead: one at the very edge of the notice can no longer be changed online.
		const h = (await hold(await slot(6))).json;
		await w.call("visitor-9", "POST", `${A}/book/holds/${h.reference}/submit`, {
			holdToken: h.holdToken,
			contact: bookingContact({ phone: "0733 000 111" }),
		});
		const id = (
			(await w.call("visitor-9", "GET", `${A}/me/appointments`)).json.items as { id: string }[]
		)[0]?.id;
		expect((await w.call("visitor-8", "POST", `${A}/me/appointments/${id}/cancel`)).status).toBe(
			404,
		);
		expect((await w.call("visitor-9", "POST", `${A}/me/appointments/${id}/cancel`)).status).toBe(
			200,
		);
	});

	it("the team's views of a request: it lists, and deciding twice is a conflict", async () => {
		const h = (await hold(await slot())).json;
		const sub = (
			await key("POST", `/book/holds/${h.reference}/submit`, {
				holdToken: h.holdToken,
				contact: bookingContact({ phone: "0733 000 111" }),
			})
		).json;
		const list = (
			await w.call("rita", "GET", `${A}/requests?from=${NOW}&to=${NOW + 20 * 24 * HOUR}`)
		).json.items as { reference: string; status: string }[];
		expect(list.find((r) => r.reference === sub.reference)?.status).toBe("requested");
		await w.call("rita", "POST", `${A}/requests/${sub.reference}/decision`, {
			decision: "decline",
			reason: "full",
		});
		expect(
			(
				await w.call("rita", "POST", `${A}/requests/${sub.reference}/decision`, {
					decision: "confirm",
				})
			).status,
		).toBe(404);
		expect(
			(await w.call("rita", "POST", `${A}/requests/ZZZZ-ZZZZ/decision`, { decision: "confirm" }))
				.status,
		).toBe(404);
	});
});

describe("the service itself", () => {
	it("serves the contract as OpenAPI with no sign-in, and a health probe with no data", async () => {
		const doc = (await w.call(null, "GET", "/v1/openapi.json")).json as {
			openapi: string;
			paths: Record<string, unknown>;
		};
		expect(doc.openapi).toBe("3.1.0");
		expect(Object.keys(doc.paths)).toContain("/v1/apps/{app}/clients/{id}");
		expect((await w.call(null, "GET", "/health")).json).toEqual({ status: "ok" });
		expect((await w.call(null, "GET", "/ready")).status).toBe(200);
	});

	it("is not ready when the store cannot be reached", async () => {
		w.deps.store.ping = () => Promise.reject(new Error("down"));
		expect((await w.call(null, "GET", "/ready")).status).toBe(503);
	});

	it("sets security headers and a request id on every answer", async () => {
		const r = await w.call("rita", "GET", `${A}/clients`);
		expect(r.headers.get("x-content-type-options")).toBe("nosniff");
		expect(r.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("on the Convex adapter, a store that cannot be reached is a 503 and nothing is made up", async () => {
		const down = (): Promise<never> =>
			Promise.reject(new StoreUnavailable("the store did not answer"));
		const store = createConvexStore({
			visitor: { services: down } as never,
			staff: {} as never,
			rpc: { query: down, mutation: down },
			live: {} as never,
			serverKey: "k",
		});
		w.deps.store = store;
		const r = await w.call("rita", "GET", `${A}/clients`);
		expect(r.status).toBe(503);
		expect(err(r)).toBe("unavailable");
		expect(JSON.stringify(r.json)).not.toContain("the store did not answer");
	});
});
