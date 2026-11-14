import { schedulingPort } from "@psi/guide";
import type { RunningApi } from "@psi/scheduling-api/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { decode, inputs, siteOnService } from "./test-flow";

/**
 * Online booking paused by the clinic, against the real scheduling service (in-process, psizone-web's own service key):
 * the booking page shows the clinic's message instead of the times, with the callback form while callbacks stay open and
 * the phones alone when they are closed (a callback posted anyway is not sent), the guide's port reads the pause and its
 * free times answer it, and lifting the pause brings the times back.
 */
const MONDAY = Date.UTC(2027, 0, 11, 6, 0, 0);
const A = "/v1/apps/psizone";
const MESSAGE = {
	ro: "Revenim din 18 ianuarie. Mulțumim pentru răbdare!",
	en: "We are back on 18 January.",
};
let api: RunningApi;
const made: string[] = [];

beforeAll(async () => {
	vi.useFakeTimers({ toFake: ["Date"], now: MONDAY });
	api = await siteOnService(MONDAY);
});
afterEach(async () => {
	for (const id of made.splice(0))
		await api.world.call("olga", "DELETE", `${A}/booking-pauses/${id}`);
});
afterAll(async () => {
	await api.close();
	vi.useRealTimers();
});

async function pause(body: Record<string, unknown>): Promise<void> {
	const r = await api.world.call("olga", "POST", `${A}/booking-pauses`, {
		callbacksOpen: true,
		blockStaff: false,
		message: MESSAGE,
		...body,
	});
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	made.push(String(r.json.id));
}
const page = async (path = "/programare"): Promise<string> => {
	const { app } = await import("./server");
	return decode(await (await app.request(path)).text());
};
const callbacks = async (): Promise<number> =>
	(
		(
			await api.world.call(
				"olga",
				"GET",
				`${A}/requests?from=${MONDAY - 86_400_000}&to=${MONDAY + 30 * 86_400_000}`,
			)
		).json.items as unknown[]
	).length;

describe("the booking page while online booking is paused", () => {
	it("shows the times when nothing is paused", async () => {
		const html = await page();
		expect(html).toContain("pz-slots");
		expect(html).not.toContain("data-booking-paused");
	});

	it("shows the clinic's message, not the times, and keeps the callback form while callbacks are open", async () => {
		await pause({ scope: { level: "organisation" } });
		const html = await page();
		expect(html).toContain('data-booking-paused="organisation"');
		expect(html).toContain(MESSAGE.ro);
		expect(html).toContain("Programările online sunt oprite acum");
		expect(inputs(html, "slot")).toHaveLength(0);
		expect(html).toContain('name="consent"');
	});

	it("says when booking opens again, in the clinic's zone", async () => {
		await pause({ scope: { level: "organisation" }, until: Date.UTC(2027, 0, 18, 6, 0, 0) });
		const html = await page();
		expect(html).toContain("Le redeschidem");
		expect(html).toContain("18 ianuarie");
		expect(html).toContain("08:00");
	});

	it("leaves only the phones when callbacks are closed too, and sends nothing posted anyway", async () => {
		await pause({ scope: { level: "organisation" }, callbacksOpen: false });
		const html = await page();
		expect(html).toContain(MESSAGE.ro);
		expect(html).not.toContain('name="consent"');
		const before = await callbacks();
		const { app } = await import("./server");
		const res = await app.request("/programare", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded", "datastar-request": "true" },
			body: new URLSearchParams({
				form: "booking",
				name: "Ana Test",
				age: "9",
				phone: "0720000111",
				email: "ana@example.test",
				details: "Ne-ar ajuta o evaluare, mulțumim.",
				forWhom: "child",
				when: "any",
				consent: "yes",
				slot: "",
			}).toString(),
		});
		expect(res.status).toBe(200);
		expect(decode(await res.text())).toContain(MESSAGE.ro);
		expect(await callbacks()).toBe(before);
	});

	it("pauses one service only on its own page", async () => {
		await pause({ scope: { level: "service", service: "evaluation" } });
		const html = await page("/programare?serviciu=evaluation");
		expect(html).toContain('data-booking-paused="service"');
		expect(inputs(html, "slot")).toHaveLength(0);
	});

	it("gives the times back once the pause is lifted", async () => {
		await pause({ scope: { level: "organisation" } });
		expect(await page()).toContain("data-booking-paused");
		for (const id of made.splice(0))
			await api.world.call("olga", "DELETE", `${A}/booking-pauses/${id}`);
		expect(await page()).toContain("pz-slots");
	});
});

describe("the guide's port while online booking is paused", () => {
	it("reads the pause with the services, and its free times answer it", async () => {
		const { scheduling } = await import("./booking-store");
		if (scheduling === undefined) throw new Error("scheduling is off");
		// No cache between the two reads: a fresh port each time.
		expect(await schedulingPort(scheduling, 0).pause?.("psizone")).toBeUndefined();
		await pause({ scope: { level: "organisation" } });
		const port = schedulingPort(scheduling, 0);
		expect(await port.pause?.("psizone")).toMatchObject({
			level: "organisation",
			message: MESSAGE,
			callbacksOpen: true,
		});
		const found = await port.findSlots({
			tenant: "psizone",
			service: "evaluation",
			from: MONDAY,
			to: MONDAY + 7 * 86_400_000,
		});
		expect(found).toMatchObject({ ok: false, reason: "paused", pause: { message: MESSAGE } });
	});
});
