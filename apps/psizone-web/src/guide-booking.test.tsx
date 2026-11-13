/** @jsxRuntime automatic @jsxImportSource hono/jsx */

import { siteSettingsFor } from "@psi/cms-client";
import type { BookingOffer } from "@psi/guide";
import { encodeSlot } from "@psi/scheduling";
import { ANA, NOW, store } from "@psi/scheduling/testing";
import { createPicker } from "@psi/ui";
import type { Child } from "hono/jsx";
import { describe, expect, it } from "vitest";
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
		for (const kind of ["times", "confirm", "cancel_ask", "cancel_result", "services"] as const) {
			const text =
				guideLabels("ro", { settings: siteSettingsFor({}, "psizone"), picker }).booking?.summary({
					...confirm,
					kind,
				}) ?? "";
			expect(text).not.toMatch(/\d{2}:\d{2}|demo|Ana/i);
		}
	});
});
