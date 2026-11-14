import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Hemi-Sync's booking through its own routes against the real scheduling service (apps/scheduling-api in-process,
 * on a real port, with hemisync-web's own service key, which reaches only the `hemisync` app): a session is held,
 * confirmed with the five fields, the team is notified and the journal records it as this site's service; a callback
 * request is stored the same way. Psizone's calendar, in the same service, never shows.
 */

/** A working Monday morning in Bucharest: the week the page opens on has free times whatever day the test runs. */
const MONDAY = Date.UTC(2027, 0, 11, 6, 0, 0);
const H = "/v1/apps/hemisync";
let api: RunningApi;
/** The site's booking routes on their own, as the server mounts them (its booking store reads the environment). */
let app: Hono;

beforeAll(async () => {
	vi.useFakeTimers({ toFake: ["Date"], now: MONDAY });
	api = await startApi({
		// Hemi-Sync's own session and the person who gives it, made through the API by its owner.
		async grow(world) {
			const person = await world.call("hugo", "POST", `${H}/people`, {
				displayName: "Hana Test",
				kind: "practitioner",
				subject: "hana",
			});
			const service = await world.call("hugo", "POST", `${H}/services`, {
				slug: "session",
				name: { ro: "Sesiune hemisync", en: "Session hemisync" },
				durationMinutes: 60,
				bufferMinutes: 0,
				modes: ["onsite"],
				practitionerIds: [String(person.json.id)],
			});
			if (service.status !== 200) throw new Error(`no hemisync session: ${service.status}`);
		},
	});
	api.world.clock.now = MONDAY;
	process.env.SCHEDULING_API_URL = api.url;
	process.env.SCHEDULING_SERVICE_KEY = api.serviceKey("hemisync-web");
	const { registerBooking } = await import("./booking-routes");
	app = new Hono();
	app.use(contextStorage());
	registerBooking(app, "ro");
});
afterAll(async () => {
	await api.close();
	vi.useRealTimers();
});

const decode = (s: string): string =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");

async function post(path: string, body: Record<string, string>): Promise<string> {
	const res = await app.request(path, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded", "datastar-request": "true" },
		body: new URLSearchParams(body).toString(),
	});
	expect(res.status).toBe(200);
	return decode(await res.text());
}

function inputs(html: string, name: string): ReadonlyArray<string> {
	return (html.match(/<input[^>]*>/g) ?? []).filter((tag) => tag.includes(`name="${name}"`));
}
const value = (tag: string | undefined): string => /value="([^"]*)"/.exec(tag ?? "")?.[1] ?? "";

const person = {
	form: "booking",
	name: "Ana Popescu",
	email: "ana@example.test",
	phone: "0700123456",
	age: "34",
	details: "Vreau să aflu ce sesiune mi se potrivește.",
	when: "any",
	consent: "yes",
};

describe("Hemi-Sync books through the scheduling service", () => {
	it("a session: the page shows Hemi-Sync's times only, the hold, the confirm, the team told, the journal", async () => {
		const page = decode(await (await app.request("/programare")).text());
		expect(page).toMatch(/Sesiune hemisync/);
		expect(page).not.toMatch(/Evaluare|evaluation/);
		const slots = inputs(page, "slot");
		expect(slots.length).toBeGreaterThan(0);
		const slot = value(slots[0]);

		const held = await post("/programare", { ...person, slot, service: "session" });
		const carried: Record<string, string> = {};
		for (const tag of held.match(/<input[^>]*type="hidden"[^>]*>/g) ?? []) {
			carried[/name="([^"]*)"/.exec(tag)?.[1] ?? ""] = value(tag);
		}
		expect(carried.reference).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

		const told = api.world.notifier.sent.length;
		const done = await post("/programare/confirma", carried);
		expect(done).toContain(carried.reference ?? "?");
		expect(done).toMatch(/[0-9A-Z]{4}(?:-[0-9A-Z]{4}){3}/);
		const sent = api.world.notifier.sent.slice(told);
		expect(sent.map((n) => n.event)).toEqual(["request.created", "appointment.requested"]);
		expect(sent.every((n) => n.app === "hemisync")).toBe(true);
		const journal = await api.world.call("hugo", "GET", `${H}/audit?action=request.create`);
		expect(journal.json.items).toEqual([
			expect.objectContaining({
				actor: expect.objectContaining({ subject: "service:hemisync-web", kind: "service" }),
				target: expect.objectContaining({ id: carried.reference }),
			}),
		]);
		// Nothing reached Psizone's calendar.
		const psizone = await api.world.call(
			"olga",
			"GET",
			"/v1/apps/psizone/audit?action=request.create",
		);
		expect(psizone.json.items).toEqual([]);
	}, 60_000);

	it("a callback request (no time chosen) is stored by the service in Hemi-Sync's app and the team is told", async () => {
		const told = api.world.notifier.sent.length;
		const thanked = await post("/programare", { ...person, slot: "", name: "Ion Apel" });
		expect(thanked).toContain("Ion Apel");
		const sent = api.world.notifier.sent.slice(told);
		expect(sent.map((n) => `${n.app}:${n.event}`)).toEqual(["hemisync:request.created"]);
		const journal = await api.world.call("hugo", "GET", `${H}/audit?action=callback.create`);
		expect((journal.json.items as unknown[]).length).toBe(1);
	}, 30_000);
});
