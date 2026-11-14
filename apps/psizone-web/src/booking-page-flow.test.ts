import { encodeSlot } from "@psi/scheduling";
import type { RunningApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checked, decode, inputs, post, siteOnService, value } from "./test-flow";

/**
 * The booking page and the picker's route through the app's own routes, against the real scheduling service
 * (apps/scheduling-api in-process, its synthetic clinic, psizone-web's own service key): the site books through the
 * service's visitor routes, so the team is notified and the journal records the request. With no service at all, see
 * booking-page-off.test.ts.
 */
/** A working Monday morning in Bucharest: the week the page opens on has free times whatever day the test runs. */
const MONDAY = Date.UTC(2027, 0, 11, 6, 0, 0);
let api: RunningApi;
beforeAll(async () => {
	vi.useFakeTimers({ toFake: ["Date"], now: MONDAY });
	api = await siteOnService(MONDAY);
});
afterAll(async () => {
	await api.close();
	vi.useRealTimers();
});

describe("the booking page against the scheduling service", () => {
	it("deep link, week navigation, forged and real slots, the taken notice, and a full booking", async () => {
		const { app } = await import("./server");

		// The page: the picker for the default service, with this week's seven days.
		const page = decode(await (await app.request("/programare")).text());
		expect(page).toContain("pz-slots");
		expect(inputs(page, "day")).toHaveLength(7);
		expect(page).toContain("data-today");
		const slug = value(inputs(page, "shown")[0]);
		expect(slug).toMatch(/^[a-z0-9-]+$/);

		// The deep link preselects a service; an unknown one falls back to the default.
		const deep = decode(await (await app.request(`/programare?serviciu=${slug}`)).text());
		expect(value(inputs(deep, "shown")[0])).toBe(slug);
		const unknown = decode(await (await app.request("/programare?serviciu=zzz-unknown")).text());
		expect(value(inputs(unknown, "shown")[0])).toBe(slug);

		// A real time, read from the picker; nothing is chosen yet, so no contact fields.
		const slots = inputs(page, "slot");
		expect(slots.length).toBeGreaterThan(0);
		expect(page).not.toContain('name="consent"');
		const real = value(slots[0]);
		const base = { form: "booking", cards: "1", shown: slug, service: slug, mode: "onsite" };

		// A forged but well-formed id is refused with the taken notice, nothing chosen.
		const forged = encodeSlot({
			practitioner: "forgedpractitioner1",
			start: Date.now() + 3_600_000 * 24 * 3,
			mode: "onsite",
		});
		const refused = await post(app, "/programare/ore", { ...base, slot: forged });
		expect(refused).not.toContain('name="consent"');
		expect(inputs(refused, "slot").some(checked)).toBe(false);

		// A forged id naming a service the store does not have is the same as no slot.
		const other = await post(app, "/programare/ore", {
			...base,
			service: "zzz-unknown",
			shown: "zzz-unknown",
			slot: real,
		});
		expect(inputs(other, "slot").some(checked)).toBe(false);

		// Next week and back: the week field moves, the typed name stays.
		const next = decode(
			await (
				await app.request("/programare/ore?week=2099-01-01", {
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
						"datastar-request": "true",
					},
					body: new URLSearchParams({ ...base, name: "Ana Typed" }).toString(),
				})
			).text(),
		);
		expect(value(inputs(next, "week")[0])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(next).toContain('value="Ana Typed"');
		expect(inputs(next, "day").length).toBe(7);

		// The real time opens the details in place, chosen.
		const chosen = await post(app, "/programare/ore", {
			...base,
			slot: real,
			week: value(inputs(page, "week")[0]),
		});
		expect(inputs(chosen, "slot").filter(checked).map(value)).toEqual([real]);
		expect(chosen).toContain('name="consent"');
		expect(chosen).toContain("pz-slots__live");

		// Submitting the details holds the time and shows the confirm step.
		const held = await post(app, "/programare", {
			...base,
			slot: real,
			name: "Test Vizitator",
			phone: "0712 345 678",
			email: "",
			forWhom: "adult",
			when: "any",
			consent: "yes",
		});
		const carried: Record<string, string> = {};
		for (const tag of held.match(/<input[^>]*type="hidden"[^>]*>/g) ?? []) {
			carried[/name="([^"]*)"/.exec(tag)?.[1] ?? ""] = value(tag);
		}
		expect(carried.reference).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

		// A second visitor takes the same time while it is held: the picker says it just went.
		const second = await post(app, "/programare", {
			...base,
			slot: real,
			name: "Alt Vizitator",
			phone: "0712 345 679",
			email: "",
			forWhom: "adult",
			when: "any",
			consent: "yes",
		});
		expect(second).toContain('role="alert"');
		expect(inputs(second, "slot").some(checked)).toBe(false);

		// Confirming sends the request: the reference and cancel code, as before.
		const told = api.world.notifier.sent.length;
		const done = await post(app, "/programare/confirma", carried);
		expect(done).toContain(carried.reference ?? "?");
		expect(done).toMatch(/[0-9A-Z]{4}(?:-[0-9A-Z]{4}){3}/);

		// The team is told, and the journal has the request, as the site's service.
		expect(api.world.notifier.sent.slice(told).map((n) => n.event)).toEqual([
			"request.created",
			"appointment.requested",
		]);
		const journal = await api.world.call(
			"olga",
			"GET",
			"/v1/apps/psizone/audit?action=request.create",
		);
		expect(journal.json.items).toEqual([
			expect.objectContaining({
				actor: expect.objectContaining({ subject: "service:psizone-web", kind: "service" }),
				target: expect.objectContaining({ id: carried.reference }),
			}),
		]);
	}, 60_000);

	it("a callback request (no time chosen) is stored by the service and the team is told", async () => {
		const { app } = await import("./server");
		const told = api.world.notifier.sent.length;
		const thanked = await post(app, "/programare", {
			form: "booking",
			name: "Test Apel",
			phone: "0712 345 670",
			email: "",
			forWhom: "adult",
			when: "morning",
			slot: "",
			consent: "yes",
		});
		expect(thanked).toContain("Test Apel");
		expect(api.world.notifier.sent.slice(told).map((n) => n.event)).toEqual(["request.created"]);
		expect(await api.world.dump()).toContain("0712 345 670");
	}, 30_000);
});
