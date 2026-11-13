import { describe, expect, it } from "vitest";
import { APP_DEFAULTS, APP_KEYS, type AppKey } from "./apps";
import { CATALOGUE, messageStem } from "./catalogue";
import { paletteOf } from "./palette";
import { type Meta, pushWords, render } from "./render";
import { SAMPLES } from "./testing/samples";

function metaFor(app: AppKey): Meta {
	const s = APP_DEFAULTS[app];
	return {
		event: "request.new",
		audience: "team",
		channels: { in_app: true, push: true, email: true },
		brandName: s.brandName,
		theme: s.theme,
		timeZone: s.timeZone,
		siteUrl: "https://psizone.example",
		consoleUrl: "https://clinic.example",
		place: s.place,
	};
}

describe("templates", () => {
	for (const entry of CATALOGUE) {
		for (const locale of ["ro", "en"] as const) {
			it(`${messageStem(entry)} renders in ${locale} with its key facts`, () => {
				const sample = SAMPLES[entry.event];
				const r = render(entry, sample, locale, metaFor("psizone"));
				expect(r.subject.length).toBeGreaterThan(3);
				expect(r.html).toContain("<!doctype html>");
				expect(r.html).toContain(`lang="${locale}"`);
				expect(
					r.url.startsWith(
						entry.audience === "client" ? "https://psizone.example" : "https://clinic.example",
					) || r.url === sample.manageUrl,
				).toBe(true);
				const all = `${r.subject} ${r.body} ${r.text}`;
				if (typeof sample.serviceName === "string" && entry.audience !== "reception")
					expect(all).toContain(sample.serviceName);
				if (typeof sample.clientName === "string" && entry.audience !== "client")
					expect(r.body).toContain(sample.clientName);
				if (typeof sample.amount === "string") expect(all).toContain(sample.amount);
				if (typeof sample.startsAt === "string") expect(r.text).toMatch(/\d{2}:\d{2}/);
				expect(all).not.toMatch(/\{[a-z]+\}/);
			});
		}
	}

	it("the two locales differ for the same entry", () => {
		const entry = CATALOGUE.find(
			(e) => e.event === "appointment.confirmed" && e.audience === "client",
		);
		if (!entry) throw new Error("entry missing");
		const ro = render(entry, SAMPLES["appointment.confirmed"], "ro", metaFor("psizone"));
		const en = render(entry, SAMPLES["appointment.confirmed"], "en", metaFor("psizone"));
		expect(ro.subject).not.toBe(en.subject);
		expect(ro.body).toContain("decembrie");
		expect(en.body).toContain("December");
	});

	it("a client's confirmation carries the clinic address, the map link and the calendar file", () => {
		const entry = CATALOGUE.find(
			(e) => e.event === "appointment.confirmed" && e.audience === "client",
		);
		if (!entry) throw new Error("entry missing");
		const r = render(entry, SAMPLES["appointment.confirmed"], "en", metaFor("psizone"));
		expect(r.text).toContain("General Alexandru Cernat 126");
		expect(r.html).toContain(APP_DEFAULTS.psizone.place.mapUrl.replace(/&/g, "&amp;"));
		expect(r.html).toContain("https://clinic.example/ics/t1");
	});

	it("the day-before reminder has ONE-CLICK confirm as the action and cancel as a link", () => {
		const entry = CATALOGUE.find((e) => e.event === "reminder.day_before");
		if (!entry) throw new Error("entry missing");
		const r = render(entry, SAMPLES["reminder.day_before"], "ro", metaFor("hemisync"));
		expect(r.html).toContain('href="https://clinic.example/v1/public/reminders/c1/confirm"');
		expect(r.html).toContain('href="https://clinic.example/v1/public/reminders/c2/cancel"');
	});

	it("escapes a hostile name in the e-mail", () => {
		const entry = CATALOGUE.find(
			(e) => e.event === "appointment.confirmed" && e.audience === "client",
		);
		if (!entry) throw new Error("entry missing");
		const r = render(
			entry,
			{ ...SAMPLES["appointment.confirmed"], clientName: '<script>alert("x")</script>' },
			"ro",
			metaFor("psizone"),
		);
		expect(r.html).not.toContain("<script>");
		expect(r.html).toContain("&lt;script&gt;");
	});

	it("the brand is painted from the design tokens and differs per app", () => {
		const entry = CATALOGUE[0];
		if (!entry) throw new Error("entry missing");
		const a = render(entry, SAMPLES[entry.event], "ro", metaFor("psizone"));
		const b = render(entry, SAMPLES[entry.event], "ro", metaFor("hemisync"));
		expect(a.html).toContain(paletteOf("psizone-light").accent);
		expect(b.html).toContain(paletteOf("hemisync-light").accent);
		expect(a.html).not.toBe(b.html);
		expect(APP_KEYS.length).toBe(2);
	});

	it("a push says only the brand and a fixed sentence, in both languages", () => {
		for (const locale of ["ro", "en"] as const) {
			const w = pushWords("Psizone", locale);
			expect(w.title).toBe("Psizone");
			expect(w.body.length).toBeGreaterThan(5);
			expect(w.body).not.toMatch(/\d/);
		}
	});
});
