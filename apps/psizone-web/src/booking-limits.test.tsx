/** @jsxRuntime automatic @jsxImportSource hono/jsx */

import type { BookingOffer } from "@psi/guide";
import type { Child } from "hono/jsx";
import { describe, expect, it } from "vitest";
import { createPicker, PickerChoices, type PickerView } from "./booking-picker";
import { scheduleOf } from "./booking-routes";
import { ChatBooking } from "./chat-booking";
import { ANA, type Free, NOW, store } from "./test-store";

/** NOW is Thursday 12 November 2026, 10:00 in Bucharest. */
const FRI_9 = Date.parse("2026-11-13T07:00:00Z");
const NEXT_TUE = Date.parse("2026-11-17T08:00:00Z");
const IN_A_MONTH = Date.parse("2026-12-08T08:00:00Z");
const FREE: Free[] = [
	{ service: "evaluation", practitioner: ANA, start: FRI_9, mode: "onsite" },
	{ service: "evaluation", practitioner: ANA, start: NEXT_TUE, mode: "onsite" },
	{ service: "evaluation", practitioner: ANA, start: IN_A_MONTH, mode: "onsite" },
];
const picker = createPicker(store(FREE).client, "psizone", () => NOW);
async function ready(over: Record<string, string>) {
	const view: PickerView = await picker.view(PickerChoices.parse(over));
	if (view.kind !== "ready") throw new Error("expected a ready view");
	return view.data;
}
const html = async (child: Child): Promise<string> => String(await (<div>{child}</div>).toString());
const offer = (limits?: BookingOffer["limits"]): BookingOffer => ({
	kind: "times",
	service: "evaluation",
	status: "ok",
	timeZone: "Europe/Bucharest",
	slots: [],
	...(limits === undefined ? {} : { limits }),
});

describe("the picker on the organisation's horizon", () => {
	it("no time past the horizon, and no week after the one it ends in", async () => {
		const near = await ready({ horizon: "3" });
		expect(near.slots.map((s) => s.start)).toEqual([FRI_9]);
		expect(near.nextWeek).toBeUndefined();
		const clamped = await ready({ horizon: "3", week: "2026-11-16" });
		expect(clamped.week).toBe("2026-11-09");
	});

	it("an empty week does not point past the horizon", async () => {
		const later = await ready({ horizon: "10", week: "2026-11-23" });
		expect(later.week).toBe("2026-11-16");
		const empty = await ready({ horizon: "10", mode: "online" });
		expect(empty.nextWithTimes).toBeUndefined();
	});

	it("a wider horizon shows the later times; without one, the page's own twelve weeks", async () => {
		expect((await ready({ horizon: "10", week: "2026-11-16" })).slots.map((s) => s.start)).toEqual([
			NEXT_TUE,
		]);
		expect((await ready({ week: "2026-12-07" })).slots.map((s) => s.start)).toEqual([IN_A_MONTH]);
		expect((await ready({ horizon: "30", week: "2026-12-07" })).slots.map((s) => s.start)).toEqual([
			IN_A_MONTH,
		]);
	});

	it.each([
		"0",
		"91",
		"-3",
		"3.5",
		"abc",
		"<b>",
	])("a horizon that is not 1 to 90 days (%s) is none", (raw) => {
		expect(PickerChoices.parse({ horizon: raw }).horizon).toBe("");
	});
	it.each(["1", "9", "10", "89", "90"])("%s days is a horizon", (raw) => {
		expect(PickerChoices.parse({ horizon: raw }).horizon).toBe(raw);
	});
});

describe("the chat's form on the organisation's terms", () => {
	it("no call back offered: the switch is gone, and the form carries the terms to its next step", async () => {
		const page = await html(
			await ChatBooking({
				locale: "ro",
				offer: offer({ horizonDays: 3, offerCallback: false }),
				source: picker,
			}),
		);
		expect(page).not.toContain("Prefer să mă sunați voi");
		expect(page).toContain('name="horizon" value="3"');
		expect(page).toContain('name="nocall" value="1"');
	});

	it("a call back offered: the switch stays", async () => {
		const page = await html(
			await ChatBooking({
				locale: "en",
				offer: offer({ horizonDays: 21, offerCallback: true }),
				source: picker,
			}),
		);
		expect(page).toContain("I would rather be called");
		expect(page).toContain('name="horizon" value="21"');
		expect(page).toContain('name="nocall" value=""');
	});

	it("an offer from a site the organisation does not govern: the page's own form", async () => {
		const page = await html(await ChatBooking({ locale: "ro", offer: offer(), source: picker }));
		expect(page).toContain("Prefer să mă sunați voi");
		expect(page).toContain('name="horizon" value=""');
	});

	it("a picker step that asks for a call while none is offered stays on the times", async () => {
		const schedule = await scheduleOf(
			{ callback: "1", nocall: "1", horizon: "3" },
			{ source: picker },
		);
		expect(schedule?.callback).toBe(false);
		expect(schedule?.noCallback).toBe(true);
		expect(schedule?.horizon).toBe("3");
		const free = await scheduleOf({ callback: "1" }, { source: picker });
		expect(free?.callback).toBe(true);
	});
});
