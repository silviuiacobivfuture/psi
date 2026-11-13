import { describe, expect, it } from "vitest";
import { type CallbackMailCopy, type CallbackRequest, callbackMail } from "./callback-mail";

const COPY: CallbackMailCopy = {
	intro: (site) => `intro ${site}`,
	subject: (name) => `subject ${name}`,
	name: "Nume",
	phone: "Telefon",
	email: "E-mail",
	age: "Vârsta",
	details: "Detalii",
	forWhom: "Pentru",
	when: "Când",
	slot: "Ora",
	service: "Serviciu",
	locale: "Limba",
	page: "Pagina",
	received: "Primită",
	stored: "Salvată",
	storedYes: "da",
	storedNo: "NU",
	consent: "A acceptat.",
	link: "Cererile",
	audience: { adult: "Adult" },
	period: { morning: "Dimineața", afternoon: "După-amiaza", any: "Oricând" },
};

const REQUEST: CallbackRequest = {
	name: "Ana",
	email: "ana@example.test",
	phone: "0700 000 001",
	forWhom: "adult",
	when: "any",
	locale: "en",
	channel: "form",
	page: "/contact",
};

const mail = (
	over: Partial<CallbackRequest> = {},
	input: { stored?: boolean; listUrl?: string } = {},
) =>
	callbackMail({
		copy: COPY,
		request: { ...REQUEST, ...over },
		site: "site.test",
		zone: "Europe/Bucharest",
		received: Date.parse("2026-11-12T08:00:00Z"),
		stored: input.stored ?? true,
		listUrl: input.listUrl,
	});

describe("the team's e-mail", () => {
	it("is written from the site's own words, in the team's language", () => {
		const { subject, text } = mail();
		expect(subject).toBe("subject Ana");
		expect(text).toContain("intro site.test");
		expect(text).toContain("Pentru: Adult");
		expect(text).toContain("Când: Oricând");
		expect(text).toContain("Limba: en");
		expect(text).toContain("Pagina: /contact (form)");
		expect(text).toContain("Salvată: da");
		expect(text.endsWith("\n")).toBe(true);
	});

	it("omits what was not given: no phone, no e-mail, no time, no service, no link", () => {
		const { text } = mail({ phone: "", email: "" });
		expect(text).not.toContain("Telefon:");
		expect(text).not.toContain("E-mail:");
		expect(text).not.toContain("Ora:");
		expect(text).not.toContain("Serviciu:");
		expect(text).not.toContain("Cererile");
	});

	it("names the time asked for, the service and the list, when there are some", () => {
		const { text } = mail(
			{ preferredStart: Date.parse("2026-11-20T08:00:00Z"), service: "session" },
			{ listUrl: "https://cms.example.test/list" },
		);
		expect(text).toContain("Ora: vineri, 20 noiembrie 2026");
		expect(text).toContain("Serviciu: session");
		expect(text).toContain("Cererile: https://cms.example.test/list");
	});

	it("says plainly when this e-mail is the only copy", () => {
		expect(mail({}, { stored: false }).text).toContain("Salvată: NU");
	});

	it("falls back to the audience itself when the site has no label for it", () => {
		expect(mail({ forWhom: "teen" }).text).toContain("Pentru: teen");
	});

	it("keeps a typed name from forging a header or a line", () => {
		const { subject, text } = mail({ name: "Ana\r\nBcc: x@evil.test" });
		expect(subject).not.toMatch(/[\r\n]/);
		expect(text.split("\n").filter((l) => l.startsWith("Bcc:"))).toEqual([]);
		expect(text).toContain("Nume: Ana Bcc: x@evil.test");
	});
});
