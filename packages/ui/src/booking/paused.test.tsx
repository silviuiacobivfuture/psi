import type { PauseNotice, ServiceInfo } from "@psi/scheduling";
import { describe, expect, it } from "vitest";
import { bookingSummary } from "./chat";
import { fixtureEnv } from "./fixture";
import { BookingForm } from "./form";
import { createPicker, type PickerClient } from "./picker";
import type { Schedule } from "./schedule";

/**
 * Online booking paused by the clinic, as the booking form shows it: its message where the times would be, when it
 * opens again, the phones, the callback form only while callbacks stay open, the service cards when one service is
 * paused; the picker turns the service's answers into that view; the guide remembers the turn with the message.
 */
const html = (node: unknown): string => String(node);
const PHONES = [{ tel: "+40700000001", display: "0700 000 001" }];
const NOTICE: PauseNotice = {
	level: "organisation",
	message: { ro: "Revenim luni.", en: "Back on Monday." },
	callbacksOpen: true,
};
const SERVICE = (slug: string, pause?: PauseNotice): ServiceInfo => ({
	slug,
	name: { ro: `RO ${slug}`, en: `EN ${slug}` },
	durationMinutes: 60,
	modes: ["onsite"],
	practitioners: [{ id: "practitioner01", name: "Ana" }],
	...(pause === undefined ? {} : { pause }),
});
const schedule = (
	pause: PauseNotice,
	services = [SERVICE("evaluation")],
	cards = false,
): Schedule => ({
	view: {
		kind: "paused",
		pause,
		timeZone: "Europe/Bucharest",
		services,
		service: services[0],
	},
	callback: false,
	cards,
	// The page's own terms: no horizon of the organisation's chat, the call instead offered.
	horizon: "",
	noCallback: false,
});

describe("the booking form while booking is paused", () => {
	it("shows the clinic's message in the visitor's language, the heading, the phones, and the callback form", () => {
		const ro = html(
			<BookingForm env={fixtureEnv({ phones: PHONES })} schedule={schedule(NOTICE)} />,
		);
		expect(ro).toContain('data-booking-paused="organisation"');
		expect(ro).toContain("Revenim luni.");
		expect(ro).toContain("p:paused");
		expect(ro).toContain("p:paused-callback");
		expect(ro).toContain("0700 000 001");
		expect(ro).toContain('name="consent"');
		expect(ro).not.toContain('name="slot"');
		const en = html(<BookingForm env={fixtureEnv({ locale: "en" })} schedule={schedule(NOTICE)} />);
		expect(en).toContain("Back on Monday.");
		expect(en).not.toContain("Revenim luni.");
	});

	it("leaves the phones alone when callbacks are closed: no details, no submit", () => {
		const out = html(
			<BookingForm
				env={fixtureEnv({ phones: PHONES })}
				schedule={schedule({ ...NOTICE, callbacksOpen: false })}
			/>,
		);
		expect(out).toContain("p:paused-call");
		expect(out).not.toContain("p:paused-callback");
		expect(out).not.toContain('name="consent"');
		expect(out).not.toContain('type="submit"');
	});

	it("says when booking opens again, in the clinic's zone", () => {
		const until = Date.UTC(2027, 0, 18, 6, 0, 0);
		const out = html(<BookingForm env={fixtureEnv()} schedule={schedule({ ...NOTICE, until })} />);
		expect(out).toContain("p:until");
		expect(out).toContain("08:00");
	});

	it("keeps the service cards when one service is paused, so another can be chosen", () => {
		const services = [SERVICE("evaluation", { ...NOTICE, level: "service" }), SERVICE("therapy")];
		const out = html(
			<BookingForm
				env={fixtureEnv()}
				schedule={schedule({ ...NOTICE, level: "service" }, services, true)}
			/>,
		);
		expect(out).toContain('data-booking-paused="service"');
		expect(out).toContain("RO therapy");
	});

	it("is announced to assistive technology as a status with its heading", () => {
		const out = html(<BookingForm env={fixtureEnv()} id="booking" schedule={schedule(NOTICE)} />);
		expect(out).toMatch(/role="status"[^>]*aria-labelledby="booking-paused"/);
		expect(out).toContain('id="booking-paused"');
	});
});

describe("the picker's view of a pause", () => {
	const client = (over: Partial<PickerClient> = {}): PickerClient => ({
		services: async () => ({ timeZone: "Europe/Bucharest", services: [SERVICE("evaluation")] }),
		findSlots: async () => ({
			ok: true,
			timeZone: "Europe/Bucharest",
			service: { slug: "evaluation", durationMinutes: 60, holdMinutes: 10 },
			slots: [],
		}),
		...over,
	});
	const choices = {
		service: "",
		shown: "",
		week: "",
		day: "",
		mode: "",
		who: "",
		slot: "",
		horizon: "",
	} as const;

	it("is paused when the organisation or the site is", async () => {
		const picker = createPicker(
			client({
				services: async () => ({
					timeZone: "Europe/Bucharest",
					services: [SERVICE("evaluation")],
					pause: NOTICE,
				}),
			}),
			"psizone",
		);
		expect(await picker.view(choices)).toMatchObject({ kind: "paused", pause: NOTICE });
	});

	it("is paused when the service shown is, and ready for another", async () => {
		const services = [SERVICE("evaluation", { ...NOTICE, level: "service" }), SERVICE("therapy")];
		const picker = createPicker(
			client({ services: async () => ({ timeZone: "Europe/Bucharest", services }) }),
			"psizone",
		);
		expect(await picker.view({ ...choices, service: "evaluation" })).toMatchObject({
			kind: "paused",
		});
		expect(await picker.view({ ...choices, service: "therapy" })).toMatchObject({ kind: "ready" });
	});

	it("is paused when the free times answer the pause", async () => {
		const picker = createPicker(
			client({ findSlots: async () => ({ ok: false, reason: "paused", pause: NOTICE }) }),
			"psizone",
		);
		expect(await picker.view(choices)).toMatchObject({ kind: "paused", pause: NOTICE });
	});
});

describe("the guide's memory of a paused turn", () => {
	it("carries the clinic's message in the visitor's language", () => {
		const offer = {
			kind: "times",
			service: "evaluation",
			status: "paused",
			pause: NOTICE,
			slots: [],
		} as const;
		expect(bookingSummary(offer, fixtureEnv())).toBe("s:paused Revenim luni.");
		expect(bookingSummary(offer, fixtureEnv({ locale: "en" }))).toBe("s:paused Back on Monday.");
		expect(bookingSummary({ ...offer, status: "ok" }, fixtureEnv())).toBe("s:times");
	});
});
