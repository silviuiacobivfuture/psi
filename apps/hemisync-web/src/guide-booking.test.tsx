/** @jsxRuntime automatic @jsxImportSource hono/jsx */

import { siteSettingsFor } from "@psi/cms-client";
import { type BookingOffer, confirmation, PSI_PROFILES, wantsEdit } from "@psi/guide";
import { encodeSlot } from "@psi/scheduling";
import { DAN, NOW, store, tenantCalendar } from "@psi/scheduling/testing";
import { createPicker } from "@psi/ui";
import type { Child } from "hono/jsx";
import { describe, expect, it } from "vitest";
import { bookingEnv } from "./booking-site";
import { guideLabels } from "./guide";

const START = NOW + 3 * 86_400_000;
const OWN = tenantCalendar("hemisync", DAN, START);
const SLOT = encodeSlot({ practitioner: DAN, start: START, mode: "onsite" });
const picker = createPicker(
	store(OWN.free, { catalogues: { hemisync: OWN.catalogue } }).client,
	"hemisync",
	() => NOW,
);
const html = async (child: Child): Promise<string> => String(await (<div>{child}</div>).toString());
const render = async (locale: "ro" | "en", offer: BookingOffer): Promise<string> =>
	html(
		guideLabels(locale, { settings: siteSettingsFor({}, "hemisync"), picker }).booking?.render(
			offer,
		),
	);

const slot = {
	slotId: SLOT,
	startsAt: new Date(START).toISOString(),
	date: new Date(START).toISOString().slice(0, 10),
	time: "10:00",
	weekday: 3,
	durationMinutes: 60,
	mode: "onsite" as const,
	practitioner: "DEMO Dan",
};
const offer: BookingOffer = {
	kind: "confirm",
	service: "sedinta",
	status: "ok",
	slots: [slot],
	chosen: slot,
};
const FULL = {
	name: "Dan Ionescu",
	age: 41,
	details: "Caut ajutor pentru somn și pentru neliniște",
	phone: "+40722123456",
	email: "dan@example.ro",
	forWhom: "adult" as const,
};
const details = (
	over: Partial<NonNullable<BookingOffer["details"]>>,
): NonNullable<BookingOffer["details"]> => ({
	values: {},
	missing: ["name", "age", "details", "phone", "email"],
	heard: [],
	ask: "name",
	nudge: false,
	edit: false,
	...over,
});

describe("Hemi-Sync's guide books adults, one question at a time", () => {
	it.each([
		["ro", "Cum te numești?"],
		["en", "What is your name?"],
	] as const)("asks the name first in %s", async (locale, line) => {
		const out = await render(locale, { ...offer, details: details({}) });
		expect(out).toContain(line);
		expect(out).not.toContain("<form");
	});

	it.each([
		"ro",
		"en",
	] as const)("the summary in %s has every detail and never asks who it is for", async (locale) => {
		const out = await render(locale, {
			...offer,
			kind: "summary",
			details: details({ values: FULL, missing: [], ask: undefined }),
		});
		for (const text of [
			"Dan Ionescu",
			"41",
			"+40722123456",
			"dan@example.ro",
			"somn",
			"DEMO Dan",
		]) {
			expect(out, text).toContain(text);
		}
		expect((out.match(/<button/g) ?? []).length).toBe(2);
		expect(out).not.toContain("<form");
		expect(out).not.toContain(bookingEnv(locale).copy.chat.card.labels.forWhom);
	});

	it("the buttons' words are a yes and an edit to the guide, and the audience is adult as the profile says", () => {
		for (const locale of ["ro", "en"] as const) {
			const env = bookingEnv(locale);
			expect(confirmation(env.copy.chat.card.confirm), locale).toBeDefined();
			expect(wantsEdit(env.copy.chat.card.edit), locale).toBe(true);
			expect(PSI_PROFILES.hemisync.scheduling?.audiences).toEqual(env.audiences);
		}
	});

	it("the booked card gives the reference and the cancel code once, and says the team calls", async () => {
		const out = await render("ro", {
			...offer,
			kind: "booked",
			slots: [],
			booked: {
				name: "Dan Ionescu",
				reference: "ABCD2345",
				cancelCode: "WXYZ-2345-ABCD-6789",
				start: START,
				timeZone: "Europe/Bucharest",
				mode: "onsite",
				practitioner: "DEMO Dan",
			},
		});
		expect(out).toContain("ABCD2345");
		expect(out).toContain("WXYZ-2345-ABCD-6789");
		expect(out).toContain("Echipa te sună");
	});

	it("a store that is down is said plainly; the site publishes no phone, so none is invented", async () => {
		const out = await render("ro", {
			...offer,
			kind: "submit_failed",
			slots: [],
			status: "unavailable",
		});
		expect(out).toContain('role="alert"');
		expect(out).not.toContain("tel:");
		expect(out).toContain("scrie „da”");
	});

	it("when the time went, the details stay in the form", async () => {
		const out = await render("ro", {
			...offer,
			kind: "times",
			notice: "taken",
			details: details({ values: FULL, missing: [], ask: undefined }),
		});
		expect(out).toContain("tocmai s-a ocupat");
		expect(out).toMatch(/name="name"[^>]*value="Dan Ionescu"/);
	});
});
