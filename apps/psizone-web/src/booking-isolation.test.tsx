import { encodeSlot } from "@psi/scheduling";
import { ANA, DAN, NOW, store, tenantCalendar } from "@psi/scheduling/testing";
import { createBookingDeps, registerBookingSubmit } from "@psi/ui";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerBookingRoutes } from "./booking-routes";
import { callbackMailCopy, site, TENANT } from "./booking-site";
import { guideLabels } from "./guide";

/**
 * Psizone reads and writes ITS calendar and no other. The scheduling store is a fake of the port
 * that records every call; it holds a calendar for "psizone" AND one for "hemisync", the same
 * service key in both, so any answer that crossed would show in the page or in the calls.
 */

const START = NOW + 3 * 86_400_000;
const OWN = tenantCalendar("psizone", ANA, START);
const OTHER = tenantCalendar("hemisync", DAN, START);
const OWN_SLOT = encodeSlot({ practitioner: ANA, start: START, mode: "onsite" });
const OTHER_SLOT = encodeSlot({ practitioner: DAN, start: START, mode: "onsite" });

function rig() {
	const fake = store([...OWN.free, ...OTHER.free], {
		catalogues: { psizone: OWN.catalogue, hemisync: OTHER.catalogue },
		hold: "ok",
	});
	const deps = createBookingDeps({
		site,
		scheduling: fake.client,
		mailer: undefined,
		notifyTo: [],
		mailCopy: callbackMailCopy(),
		host: "landing.test",
		zone: "Europe/Bucharest",
		listUrl: undefined,
		now: () => NOW,
		log: () => {},
	});
	const app = new Hono();
	for (const [locale, prefix] of [
		["ro", ""],
		["en", "/en"],
	] as const) {
		registerBookingRoutes(app, locale, prefix, deps);
		registerBookingSubmit(app, deps, locale);
	}
	return { app, fake, deps };
}

async function post(app: Hono, path: string, body: Record<string, string>): Promise<string> {
	const res = await app.request(path, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body).toString(),
	});
	expect(res.status).toBe(200);
	return res.text();
}

const person = {
	form: "booking",
	name: "Ana Popescu",
	email: "ana@example.test",
	forWhom: "adult",
	when: "any",
	consent: "yes",
};

describe("Psizone's booking carries only the psizone tenant", () => {
	it("is built for the psizone tenant", () => {
		expect(TENANT).toBe("psizone");
		expect(site.tenant).toBe("psizone");
	});

	it("draws only Psizone's service and people, on the page, the picker route and the chat", async () => {
		const { app, deps } = rig();
		for (const path of ["/programare", "/en/programare"]) {
			const page = await (await app.request(path)).text();
			expect(page).toMatch(/Sesiune psizone|Session psizone/);
			expect(page).not.toMatch(/Sesiune hemisync|Session hemisync/);
			expect(page).not.toContain(DAN);
		}
		const routed = await post(app, "/programare/ore", { form: "booking", service: "session" });
		expect(routed).toContain("Sesiune psizone");
		expect(routed).not.toContain("hemisync");
		const chat = guideLabels("ro", { picker: deps.picker }).booking?.render({
			kind: "times",
			service: "session",
			status: "ok",
			slots: [],
		});
		const html = String(await (<div>{chat}</div>).toString());
		expect(html).toContain("Sesiune psizone");
		expect(html).not.toContain("hemisync");
	});

	it("every call of a whole booking (services, slots, hold, submit, release, callback) names psizone", async () => {
		const { app, fake } = rig();
		await app.request("/programare");
		await post(app, "/programare/ore", { form: "booking", service: "session" });
		await post(app, "/programare", { ...person, slot: OWN_SLOT, service: "session" });
		await post(app, "/programare/confirma", {
			...person,
			reference: "ABCD2345",
			holdToken: "h".repeat(24),
			start: String(START),
		});
		await post(app, "/programare/renunta", {
			form: "booking",
			reference: "ABCD2345",
			holdToken: "h".repeat(24),
		});
		await post(app, "/en/programare", person);
		const methods = new Set(fake.calls.map((c) => c.method));
		for (const method of [
			"services",
			"findSlots",
			"hold",
			"submit",
			"release",
			"requestCallback",
		] as const) {
			expect(methods, method).toContain(method);
		}
		expect(fake.calls.filter((c) => c.tenant !== "psizone")).toEqual([]);
		expect(fake.callbacks.map((c) => c.tenant)).toEqual(["psizone"]);
	});

	it("never holds a time of the other site's people, even for a service Psizone has", async () => {
		const { app, fake } = rig();
		const html = await post(app, "/programare", {
			...person,
			slot: OTHER_SLOT,
			service: "session",
		});
		expect(fake.calls.filter((c) => c.method === "hold")).toEqual([]);
		expect(html).toContain('<form id="booking"');
		expect(html).not.toContain("hemisync");
	});
});
