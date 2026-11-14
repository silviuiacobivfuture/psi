import { siteSettingsFor } from "@psi/cms-client";
import { encodeSlot } from "@psi/scheduling";
import { ANA, DAN, NOW, store, tenantCalendar } from "@psi/scheduling/testing";
import { createBookingDeps, createPicker } from "@psi/ui";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerBooking } from "./booking-routes";
import { callbackMailCopy, site, TENANT } from "./booking-site";
import { guideLabels } from "./guide";
import { BOOKING_PATHS } from "./routes";

/**
 * Hemi-Sync reads and writes ITS calendar and no other. The scheduling store is a fake of the
 * port that records every call; it holds a calendar for "hemisync" AND one for "psizone", the
 * same service key in both, so any answer that crossed would show in the page or in the calls.
 */

const START = NOW + 3 * 86_400_000;
const OWN = tenantCalendar("hemisync", DAN, START);
const OTHER = tenantCalendar("psizone", ANA, START);
const OWN_SLOT = encodeSlot({ practitioner: DAN, start: START, mode: "onsite" });
const OTHER_SLOT = encodeSlot({ practitioner: ANA, start: START, mode: "onsite" });
const CENTRE_PHONE = /0748 017 752|0752 466 792|40748017752/;

function rig(options: { own?: boolean; scheduling?: "off"; callbacks?: "down" } = {}) {
	const fake = store([...OWN.free, ...OTHER.free], {
		catalogues: { hemisync: options.own === false ? [] : OWN.catalogue, psizone: OTHER.catalogue },
		hold: "ok",
		...(options.callbacks === undefined ? {} : { callbacks: options.callbacks }),
	});
	const log: string[] = [];
	const deps = createBookingDeps({
		site,
		scheduling: options.scheduling === "off" ? undefined : fake.client,
		mailer: undefined,
		notifyTo: [],
		mailCopy: callbackMailCopy(),
		host: "hemisync.test",
		zone: "Europe/Bucharest",
		listUrl: undefined,
		now: () => NOW,
		log: (line) => log.push(line),
	});
	const app = new Hono();
	registerBooking(app, "ro", deps);
	registerBooking(app, "en", deps);
	return { app, fake, deps, log };
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
	phone: "0700123456",
	age: "34",
	details: "Vreau să aflu ce sesiune mi se potrivește.",
	when: "any",
	consent: "yes",
};

describe("Hemi-Sync's booking carries only the hemisync tenant", () => {
	it("is built for the hemisync tenant, and the page lives at its own paths", () => {
		expect(TENANT).toBe("hemisync");
		expect(site.tenant).toBe("hemisync");
		expect(BOOKING_PATHS).toEqual({ ro: "/programare", en: "/en/booking" });
		expect(site.env("ro").routes.booking).toBe("/programare");
		expect(site.env("en").routes.slots).toBe("/en/booking/ore");
	});

	it("draws only Hemi-Sync's session and people, on the page, the picker route and the chat", async () => {
		const { app, deps } = rig();
		for (const path of ["/programare", "/en/booking"]) {
			const page = await (await app.request(path)).text();
			expect(page).toMatch(/Sesiune hemisync|Session hemisync/);
			expect(page).not.toMatch(/Sesiune psizone|Session psizone/);
			expect(page).not.toContain(ANA);
			expect(page).not.toMatch(CENTRE_PHONE);
		}
		const routed = await post(app, "/programare/ore", { form: "booking", service: "session" });
		expect(routed).toContain("Sesiune hemisync");
		expect(routed).not.toContain("psizone");
		const chat = guideLabels("en", { picker: deps.picker }).booking?.render({
			kind: "times",
			service: "session",
			status: "ok",
			slots: [],
		});
		const html = String(await (<div>{chat}</div>).toString());
		expect(html).toContain("Session hemisync");
		expect(html).not.toContain("psizone");
	});

	it("every call of a whole booking (services, slots, hold, submit, release, callback) names hemisync", async () => {
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
		await post(app, "/en/booking", person);
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
		expect(fake.calls.filter((c) => c.tenant !== "hemisync")).toEqual([]);
		expect(fake.callbacks.map((c) => c.tenant)).toEqual(["hemisync"]);
	});

	it("never holds a time of Psizone's people, even for a service key both have", async () => {
		const { app, fake } = rig();
		const html = await post(app, "/programare", {
			...person,
			slot: OTHER_SLOT,
			service: "session",
		});
		expect(fake.calls.filter((c) => c.method === "hold")).toEqual([]);
		expect(html).toContain('<form id="booking"');
		expect(html).not.toContain("psizone");
	});
});

describe("while the store has none of Hemi-Sync's sessions", () => {
	it("the page shows the callback form, never Psizone's times, services or phones", async () => {
		const { app, fake } = rig({ own: false });
		for (const path of ["/programare", "/en/booking"]) {
			const page = await (await app.request(path)).text();
			expect(page).toContain('name="consent"');
			expect(page).not.toContain("pz-slots");
			expect(page).not.toMatch(/Sesiune psizone|Session psizone|Specialist psizone/);
			expect(page).not.toMatch(CENTRE_PHONE);
			expect(page).not.toContain('href="tel:');
		}
		expect(fake.calls.every((c) => c.tenant === "hemisync")).toBe(true);
		expect(fake.calls.some((c) => c.method === "findSlots")).toBe(false);
	});

	it("the chat shows the callback form with Hemi-Sync's own words", async () => {
		const { deps } = rig({ own: false });
		const chat = guideLabels("ro", { picker: deps.picker }).booking?.render({
			kind: "times",
			service: "",
			status: "unavailable",
			slots: [],
		});
		const html = String(await (<div>{chat}</div>).toString());
		expect(html).toContain('name="consent"');
		expect(html).toContain("Calendarul online Hemi-Sync");
		expect(html).not.toContain("pz-slots");
		expect(html).not.toMatch(CENTRE_PHONE);
	});

	it("a callback request is stored for hemisync, as an adult, whatever the browser sent for the audience", async () => {
		const { app, fake } = rig({ own: false });
		const html = await post(app, "/programare", { ...person, forWhom: "child" });
		expect(html).toContain("Mulțumim, Ana Popescu.");
		expect(fake.callbacks).toEqual([
			{
				tenant: "hemisync",
				contact: {
					name: "Ana Popescu",
					email: "ana@example.test",
					phone: "+40700123456",
					age: 34,
					details: "Vreau să aflu ce sesiune mi se potrivește.",
				},
				audience: "adult",
				when: "any",
				locale: "ro",
				channel: "form",
				page: "/contact",
				consent: true,
			},
		]);
	});

	it("the form asks no audience question and carries the one it serves", async () => {
		const { app } = rig({ own: false });
		const page = await (await app.request("/programare")).text();
		expect(page).toContain('name="forWhom" value="adult"');
		expect(page).not.toMatch(/name="forWhom" value="(child|teen)"/);
	});
});

describe("when the request reaches nobody", () => {
	it("says so plainly and shows no phone at all: Hemi-Sync publishes none, and never borrows Psizone's", async () => {
		const { app, log } = rig({ callbacks: "down" });
		const html = await post(app, "/programare", person);
		expect(html).toContain("Cererea nu a putut fi trimisă");
		expect(html).toContain('role="alert"');
		expect(html).not.toContain("Mulțumim");
		expect(html).not.toContain('href="tel:');
		expect(html).not.toMatch(CENTRE_PHONE);
		expect(html).toContain('href="/contact"');
		expect(log.join("\n")).toContain("REQUEST LOST");
	});
});

describe("scheduling off", () => {
	it("the page is the callback form alone and nothing is stored", async () => {
		const { app, fake } = rig({ scheduling: "off" });
		const page = await (await app.request("/programare")).text();
		expect(page).toContain('name="consent"');
		expect(page).not.toContain("pz-slots");
		await post(app, "/programare", person);
		expect(fake.calls).toEqual([]);
	});
});

describe("in-chat booking switched off in the CMS", () => {
	it("points to Hemi-Sync's own booking page, in both languages", async () => {
		const { deps } = rig();
		const off = siteSettingsFor({ hemisync: { bookingInChat: "off" } }, "hemisync");
		for (const [locale, path] of [
			["ro", "/programare"],
			["en", "/en/booking"],
		] as const) {
			const labels = guideLabels(locale, {
				settings: off,
				picker: createPicker(undefined, "hemisync"),
			});
			const html = String(
				await (
					<div>
						{labels.booking?.render({ kind: "times", service: "", status: "ok", slots: [] })}
					</div>
				).toString(),
			);
			expect(html).toContain(`href="${path}"`);
			expect(html).not.toContain("<form");
		}
		expect(deps.site.tenant).toBe("hemisync");
	});
});

describe("every field is mandatory and checked on the server, in Hemi-Sync's own words", () => {
	it.each([
		["ro", "/programare", "no name", { name: "" }, "numele complet"],
		["ro", "/programare", "no age", { age: "" }, "vârsta"],
		["en", "/en/booking", "an age of 121", { age: "121" }, "whole number from 0 to 120"],
		["ro", "/programare", "no phone", { phone: "" }, "telefonul"],
		["en", "/en/booking", "a bad phone", { phone: "12345" }, "phone number"],
		["ro", "/programare", "no e-mail", { email: "" }, "e-mail"],
		["en", "/en/booking", "a typo domain", { email: "ana@gmial.com" }, "did you mean gmail.com?"],
		["ro", "/programare", "short details", { details: "scurt" }, "între 10 și 2000"],
		["en", "/en/booking", "no consent", { consent: "" }, "your agreement"],
	])("%s %s: %s comes back with the error and the typed values, storing nothing", async (_l, path, _w, over, shown) => {
		const { app, fake } = rig({ own: false });
		const html = await post(app, path, { ...person, callback: "1", ...over });
		expect(html).toContain(shown);
		expect(html).toContain('<form id="booking"');
		if (!("name" in over)) expect(html).toContain('value="Ana Popescu"');
		expect(fake.callbacks).toEqual([]);
	});

	it("marks the first wrong field for focus and links every error to its field", async () => {
		const { app } = rig({ own: false });
		const html = await post(app, "/programare", { ...person, callback: "1", age: "x", phone: "1" });
		expect(html).toMatch(/name="age"[^>]*autofocus|autofocus[^>]*name="age"/);
		expect(html).toContain('aria-invalid="true"');
		expect(html).toMatch(/id="b-age-hint"/);
		expect(html).toMatch(/inputmode="numeric"/);
		expect(html).toMatch(/type="tel"/);
		expect(html).toMatch(/type="email"/);
	});
});
