import { siteSettingsFor } from "@psi/cms-client";
import type { BookingOffer } from "@psi/guide";
import { describe, expect, it } from "vitest";
import { bookingSummary } from "./chat-booking";
import { guideLabels } from "./guide";

/** `bookingInChat` from the CMS, fed through the real parser (the shared global is never toggled live). */
const offer: BookingOffer = {
	kind: "times",
	service: "evaluation",
	status: "ok",
	timeZone: "Europe/Bucharest",
	slots: [
		{
			slotId: "demo-slot",
			startsAt: "2026-11-20T08:00:00.000Z",
			date: "2026-11-20",
			time: "10:00",
			weekday: 5,
			durationMinutes: 60,
			mode: "onsite",
			practitioner: "DEMO Ana Exemplu",
		},
	],
};

describe("booking in the guide's chat", () => {
	it("as today (no setting): the free times in the conversation", () => {
		const labels = guideLabels("ro", { settings: siteSettingsFor({}, "psizone") });
		const html = String(labels.booking?.render(offer));
		expect(html).toContain("<form");
		expect(html).toContain("10:00");
	});
	it("switched off: the way to the contact page instead, no free times", () => {
		const off = siteSettingsFor({ psizone: { bookingInChat: "off" } }, "psizone");
		const ro = String(guideLabels("ro", { settings: off }).booking?.render(offer));
		const en = String(guideLabels("en", { settings: off }).booking?.render(offer));
		expect(ro).toContain('href="/contact"');
		expect(en).toContain('href="/en/contact"');
		expect(ro).not.toContain("<form");
		expect(ro).not.toContain("10:00");
	});
	const chosen = offer.slots[0];
	const confirm: BookingOffer = {
		kind: "confirm",
		service: "evaluation",
		status: "ok",
		slots: chosen === undefined ? [] : [chosen],
		...(chosen === undefined ? {} : { chosen }),
	};

	it("a time the visitor named: the form with that one time chosen, said in words", () => {
		const html = String(
			guideLabels("ro", { settings: siteSettingsFor({}, "psizone") }).booking?.render(confirm),
		);
		expect(html).toContain("10:00");
		expect(html).toMatch(/name="slot" value="demo-slot" checked/);
		expect(html).toContain('action="/programare"');
		const en = String(
			guideLabels("en", { settings: siteSettingsFor({}, "psizone") }).booking?.render(confirm),
		);
		expect(en).toContain("is free");
		expect(en).toContain('action="/en/programare"');
	});

	it("every offer is its own form: two renders never share an id or a field id", () => {
		const labels = guideLabels("ro", { settings: siteSettingsFor({}, "psizone") });
		const ids = [labels.booking?.render(offer), labels.booking?.render(offer)].map(
			(h) => /<form id="(chat-booking-[a-z0-9]+)"/.exec(String(h))?.[1],
		);
		expect(ids[0]).toBeDefined();
		expect(ids[0]).not.toBe(ids[1]);
		expect(String(labels.booking?.render(offer))).toMatch(/id="cb-[a-z0-9]+-name"/);
	});

	it("each refinement notice has its own words, and a prefilled form carries the profile", () => {
		const labels = guideLabels("ro", {
			settings: siteSettingsFor({}, "psizone"),
			prefill: { name: "Ana Pop", phone: "0712345678" },
		});
		const said = new Set(
			(["refined", "relaxed", "taken", "not_free", "ambiguous"] as const).map((notice) =>
				String(labels.booking?.render({ ...offer, notice })).replace(/<form[\s\S]*$/, ""),
			),
		);
		expect(said.size).toBe(5);
		const html = String(labels.booking?.render(offer));
		expect(html).toContain('value="Ana Pop"');
		expect(html).toContain('value="0712345678"');
	});

	it("cancelling: asks for the reference and code, and each outcome has its own line (ro and en)", () => {
		const ask: BookingOffer = { ...offer, kind: "cancel_ask", slots: [] };
		const lines = new Set<string>();
		for (const locale of ["ro", "en"] as const) {
			const labels = guideLabels(locale, { settings: siteSettingsFor({}, "psizone") });
			expect(String(labels.booking?.render(ask))).not.toContain("<form");
			for (const status of ["cancelled", "not_found", "not_cancellable", "unavailable"] as const) {
				const html = String(
					labels.booking?.render({
						...offer,
						kind: "cancel_result",
						slots: [],
						cancel: { status },
					}),
				);
				expect(html).not.toContain("<form");
				lines.add(`${locale}:${html}`);
			}
		}
		expect(lines.size).toBe(8);
	});

	it("the guide's memory of a booking turn never holds a time, a name or a code", () => {
		for (const kind of ["times", "confirm", "cancel_ask", "cancel_result", "services"] as const) {
			const text = bookingSummary({ ...confirm, kind }, "ro");
			expect(text).not.toMatch(/\d{2}:\d{2}|demo|Ana/i);
		}
	});
});
