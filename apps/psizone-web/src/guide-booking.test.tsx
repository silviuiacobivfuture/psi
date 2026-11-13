/** @jsxRuntime automatic @jsxImportSource hono/jsx */

import { siteSettingsFor } from "@psi/cms-client";
import { type BookingOffer, confirmation, PSI_PROFILES, wantsEdit } from "@psi/guide";
import { encodeSlot } from "@psi/scheduling";
import { ANA, NOW, store } from "@psi/scheduling/testing";
import { createPicker } from "@psi/ui";
import type { Child } from "hono/jsx";
import { describe, expect, it } from "vitest";
import { bookingEnv } from "./booking-site";
import { guideLabels } from "./guide";

const START = Date.parse("2026-11-20T08:00:00Z");
const SLOT = encodeSlot({ practitioner: ANA, start: START, mode: "onsite" });
const picker = createPicker(
	store([{ service: "evaluation", practitioner: ANA, start: START, mode: "onsite" }]).client,
	"psizone",
	() => NOW,
);
/** What a booking step renders to, awaiting the async parts (the picker reads the store). */
const html = async (child: Child): Promise<string> => String(await (<div>{child}</div>).toString());
const render = async (
	locale: "ro" | "en",
	offer: BookingOffer,
	extra: Parameters<typeof guideLabels>[1] = {},
): Promise<string> =>
	html(
		guideLabels(locale, {
			settings: siteSettingsFor({}, "psizone"),
			picker,
			...extra,
		}).booking?.render(offer),
	);

/** `bookingInChat` from the CMS, fed through the real parser (the shared global is never toggled live). */
const offer: BookingOffer = {
	kind: "times",
	service: "evaluation",
	status: "ok",
	timeZone: "Europe/Bucharest",
	slots: [
		{
			slotId: SLOT,
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
	it("as today (no setting): the free times in the conversation, as the compact picker", async () => {
		const html = await render("ro", offer);
		expect(html).toContain("<form");
		expect(html).toContain("pz-slots--compact");
		expect(html).toContain("10:00");
		// The week of the offered day, from the store: Friday the 20th is the free one.
		expect(html).toMatch(/name="day" value="2026-11-20" checked/);
		expect(html).toContain('name="week" value="2026-11-16"');
		// Nothing is chosen until the visitor picks, so no contact fields yet.
		expect(html).not.toContain('name="consent"');
	});
	it("scheduling off: the contact link, no picker", async () => {
		const out = await render("ro", offer, { picker: createPicker(undefined, "psizone") });
		expect(out).toContain('href="/contact"');
		expect(out).not.toContain("pz-slots");
	});
	it("the store unreachable: the callback form and the phones, no error text", async () => {
		const down = createPicker(store([], { down: true }).client, "psizone", () => NOW);
		const html = await render("ro", offer, { picker: down });
		expect(html).toContain('href="tel:');
		expect(html).toContain('name="consent"');
		expect(html).not.toContain("pz-slots");
		expect(html).not.toMatch(/eroare|error/i);
	});
	it("switched off: the way to the contact page instead, no free times", async () => {
		const off = siteSettingsFor({ psizone: { bookingInChat: "off" } }, "psizone");
		const ro = await render("ro", offer, { settings: off });
		const en = await render("en", offer, { settings: off });
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

	it("a time the visitor named: the picker with that time chosen and the details open", async () => {
		const html = await render("ro", confirm);
		expect(html).toContain("10:00");
		expect(html.replace(/\s+/g, " ")).toContain(`name="slot" value="${SLOT}" checked`);
		expect(html).toContain('name="consent"');
		expect(html).toContain('action="/programare"');
		const en = await render("en", confirm);
		expect(en).toContain("That time is free");
		expect(en).toContain('action="/en/programare"');
	});

	it("a named time taken meanwhile: the notice and the refreshed picker, nothing chosen", async () => {
		const gone = {
			...confirm,
			chosen: {
				...offer.slots[0],
				slotId: encodeSlot({ practitioner: ANA, start: START + 3_600_000, mode: "onsite" }),
			},
		} as BookingOffer;
		const html = await render("ro", gone);
		expect(html).toContain('role="alert"');
		expect(html).not.toContain('name="consent"');
	});

	it("every offer is its own form: two renders never share an id or a field id", async () => {
		const ids = (await Promise.all([render("ro", offer), render("ro", offer)])).map(
			(h) => /<form id="(chat-booking-[a-z0-9]+)"/.exec(h)?.[1],
		);
		expect(ids[0]).toBeDefined();
		expect(ids[0]).not.toBe(ids[1]);
		expect(await render("ro", confirm)).toMatch(/id="cb-[a-z0-9]+-name"/);
	});

	it("each refinement notice has its own words, and a prefilled form carries the profile", async () => {
		const prefill = { prefill: { name: "Ana Pop", phone: "0712345678" } };
		const said = new Set(
			await Promise.all(
				(["refined", "relaxed", "taken", "not_free", "ambiguous"] as const).map(async (notice) =>
					(await render("ro", { ...offer, notice }, prefill)).replace(/<form[\s\S]*$/, ""),
				),
			),
		);
		expect(said.size).toBe(5);
		const html = await render("ro", confirm, prefill);
		expect(html).toContain('value="Ana Pop"');
		expect(html).toContain('value="0712345678"');
	});

	it("cancelling: asks for the reference and code, and each outcome has its own line (ro and en)", async () => {
		const ask: BookingOffer = { ...offer, kind: "cancel_ask", slots: [] };
		const lines = new Set<string>();
		for (const locale of ["ro", "en"] as const) {
			expect(await render(locale, ask)).not.toContain("<form");
			for (const status of ["cancelled", "not_found", "not_cancellable", "unavailable"] as const) {
				const html = await render(locale, {
					...offer,
					kind: "cancel_result",
					slots: [],
					cancel: { status },
				});
				expect(html).not.toContain("<form");
				lines.add(`${locale}:${html}`);
			}
		}
		expect(lines.size).toBe(8);
	});

	it("the guide's memory of a booking turn never holds a time, a name or a code", () => {
		for (const kind of [
			"times",
			"confirm",
			"summary",
			"booked",
			"submit_failed",
			"cancel_ask",
			"cancel_result",
			"services",
		] as const) {
			const text =
				guideLabels("ro", { settings: siteSettingsFor({}, "psizone"), picker }).booking?.summary({
					...confirm,
					kind,
				}) ?? "";
			expect(text).not.toMatch(/\d{2}:\d{2}|demo|Ana/i);
		}
	});
});

describe("the details step in the chat", () => {
	const slot = offer.slots[0];
	if (slot === undefined) throw new Error("no slot");
	const FULL = {
		name: "Ana Pop",
		age: 34,
		details: "Mă simt anxioasă de câteva luni și nu dorm bine",
		phone: "+40722123456",
		email: "ana@example.ro",
		forWhom: "adult" as const,
	};
	const step = (
		details: NonNullable<BookingOffer["details"]>,
		kind: BookingOffer["kind"] = "confirm",
		extra: Partial<BookingOffer> = {},
	): BookingOffer => ({ ...offer, kind, slots: [slot], chosen: slot, details, ...extra });
	const asking = (
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

	it("the first question follows the chosen time, in the conversation and without the form", async () => {
		const out = await render("ro", step(asking({})));
		expect(out).toContain("vineri, 20 noiembrie, 10:00");
		expect(out).toContain("Cum te numești?");
		expect(out).not.toContain("<form");
		expect(out).toContain("Completez în formular");
	});

	it.each([
		["name", "Cum te numești?"],
		["age", "Câți ani ai?"],
		["details", "Ce se întâmplă, pe scurt?"],
		["phone", "La ce număr de telefon"],
		["email", "la ce adresă de e-mail?"],
	] as const)("asks %s, and only that", async (ask, line) => {
		const lines = [
			"Cum te numești?",
			"Câți ani ai?",
			"Ce se întâmplă, pe scurt?",
			"La ce număr de telefon",
			"la ce adresă de e-mail?",
		];
		const out = await render(
			"ro",
			step(asking({ ask, values: { name: "Ana Pop" }, heard: ["name"] })),
		);
		expect(out).toContain(line);
		expect(out).toContain("Mulțumesc, Ana!");
		for (const other of lines.filter((l) => l !== line)) expect(out).not.toContain(other);
	});

	it("names the problem instead of asking again as if nothing happened", async () => {
		const phone = await render(
			"ro",
			step(asking({ ask: "phone", problem: { field: "phone", code: "invalid" } })),
		);
		expect(phone).toContain("Numărul pare incomplet — îl poți scrie din nou?");
		const typo = await render(
			"en",
			step(
				asking({
					ask: "email",
					problem: { field: "email", code: "typo", suggestion: "gmail.com" },
				}),
			),
		);
		expect(typo).toContain("Did you mean ...@gmail.com?");
		const age = await render(
			"ro",
			step(asking({ ask: "age", problem: { field: "age", code: "invalid" } })),
		);
		expect(age).toContain("între 0 și 120");
	});

	it("the summary shows every detail, the time, the practitioner, who it is for and the consent, with two buttons", async () => {
		const out = await render(
			"ro",
			step({ ...asking({}), values: FULL, missing: [], ask: undefined }, "summary"),
		);
		for (const text of [
			"vineri, 20 noiembrie, 10:00",
			"DEMO Ana Exemplu",
			"Ana Pop",
			"34",
			"+40722123456",
			"ana@example.ro",
			"anxioasă",
			"Pentru",
			"Confirmând, ești de acord",
			"Confirmă programarea",
			"Editează",
		]) {
			expect(out, text).toContain(text);
		}
		expect(out).not.toContain("<form");
		expect((out.match(/<button/g) ?? []).length).toBe(2);
		expect(out).toContain("psi-guide-ask");
	});

	it("a long description is trimmed on the card", async () => {
		const out = await render(
			"ro",
			step(
				{ ...asking({}), values: { ...FULL, details: "x".repeat(400) }, missing: [] },
				"summary",
			),
		);
		expect(out).toContain(`${"x".repeat(160)}…`);
		expect(out).not.toContain("x".repeat(161));
	});

	it("in English the summary and its buttons are English, whatever the page's language", async () => {
		const out = await render(
			"ro",
			step({ ...asking({}), values: FULL, missing: [] }, "summary", { lang: "en" }),
		);
		expect(out).toContain("Confirm booking");
		expect(out).toContain("Edit details");
		expect(out).toContain("I have everything I need");
	});

	it("the buttons send words the guide reads as a yes and as an edit, in both languages", () => {
		for (const locale of ["ro", "en"] as const) {
			const labels = guideLabels(locale, { settings: siteSettingsFor({}, "psizone"), picker });
			expect(labels.booking).toBeDefined();
		}
		for (const locale of ["ro", "en"] as const) {
			const env = bookingEnv(locale);
			expect(confirmation(env.copy.chat.card.confirm), locale).toBeDefined();
			expect(wantsEdit(env.copy.chat.card.edit), locale).toBe(true);
			expect(wantsEdit(env.copy.chat.card.confirm), locale).toBe(false);
		}
	});

	it("Edit opens the booking form with every detail typed so far", async () => {
		const out = await render("ro", step({ ...asking({}), values: FULL, missing: [], edit: true }));
		expect(out).toContain("<form");
		expect(out).toMatch(/name="name"[^>]*value="Ana Pop"/);
		expect(out).toMatch(/name="age"[^>]*value="34"/);
		expect(out).toMatch(/name="phone"[^>]*value="\+40722123456"/);
		expect(out).toMatch(/name="email"[^>]*value="ana@example.ro"/);
		expect(out).toContain("anxioasă");
	});

	it("the booked card gives the reference and the cancel code, how to cancel, and what happens next", async () => {
		const out = await render("ro", {
			...offer,
			kind: "booked",
			slots: [],
			booked: {
				name: "Ana Pop",
				reference: "ABCD2345",
				cancelCode: "WXYZ-2345-ABCD-6789",
				start: START,
				timeZone: "Europe/Bucharest",
				mode: "onsite",
				practitioner: "DEMO Ana Exemplu",
			},
		});
		expect(out).toContain("ABCD2345");
		expect(out).toContain("WXYZ-2345-ABCD-6789");
		expect(out).toContain("Echipa te sună");
		expect(out).not.toContain("<form");
	});

	it("when the time went, the lost time is said and the details stay in the form", async () => {
		const out = await render("ro", {
			...offer,
			notice: "taken",
			details: { ...asking({}), values: FULL, missing: [], ask: undefined },
		});
		expect(out).toContain("tocmai s-a ocupat");
		expect(out).toMatch(/name="name"[^>]*value="Ana Pop"/);
	});

	it("when the store is down the visitor is told so plainly, with the site's phones", async () => {
		const out = await render("ro", {
			...offer,
			kind: "submit_failed",
			slots: [],
			status: "unavailable",
		});
		expect(out).toContain('role="alert"');
		expect(out).toContain("tel:");
		expect(out).toContain("scrie „da”");
	});

	it("the booked card and the summary leave nothing in the guide's memory of the turn", () => {
		const labels = guideLabels("ro", { settings: siteSettingsFor({}, "psizone"), picker });
		for (const kind of ["summary", "booked", "submit_failed"] as const) {
			const text = labels.booking?.summary({ ...offer, kind, booked: undefined }) ?? "";
			expect(text).not.toMatch(/\d{2}:\d{2}|Ana|ABCD|@|\+40/);
		}
	});
});

describe("the site and its guide agree on who the booking is for", () => {
	it("the profile's audiences are the booking environment's, for both languages", () => {
		for (const locale of ["ro", "en"] as const) {
			expect(PSI_PROFILES.psizone.scheduling?.audiences).toEqual(bookingEnv(locale).audiences);
		}
	});
});
