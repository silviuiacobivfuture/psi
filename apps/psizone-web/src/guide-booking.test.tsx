import { siteSettingsFor } from "@psi/cms-client";
import type { BookingOffer } from "@psi/guide";
import { describe, expect, it } from "vitest";
import { guideLabels } from "./guide";

/** `bookingInChat` from the CMS, fed through the real parser (the shared global is never toggled live). */
const offer: BookingOffer = {
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
});
