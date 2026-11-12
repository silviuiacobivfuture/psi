/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import type { PickerSlot } from "../slot-week";
import {
	ServiceCards,
	SlotPicker,
	type SlotPickerLabels,
	type SlotPickerProps,
} from "./slot-picker";

const labels: SlotPickerLabels = {
	duration: (n) => `${n} min`,
	chooseDay: "Alege ziua",
	prevWeek: "Săptămâna anterioară",
	nextWeek: "Săptămâna următoare",
	today: "azi",
	freeTimes: (n) => `${n} ore libere`,
	noTimes: "nicio oră liberă",
	parts: { morning: "Dimineața", afternoon: "După-amiaza", evening: "Seara" },
	mode: "Cum preferi",
	modes: { onsite: "La cabinet", online: "Online" },
	practitioner: "Specialist",
	anyone: "Oricine",
	selected: (when, who, mode) => `Ai ales ${when}, ${mode}, cu ${who}.`,
	nothingSelected: "Alege o oră.",
	taken: "Ora tocmai s-a ocupat.",
	emptyWeek: "Nu mai sunt ore în această săptămână.",
	jumpToNext: (range) => `Prima săptămână cu ore: ${range}`,
};
const ZONE = "Europe/Bucharest";
const at = (iso: string, who = "p1", mode: "onsite" | "online" = "onsite"): PickerSlot => ({
	id: `${who}0000000000.${Date.parse(iso)}.${mode}`,
	start: Date.parse(iso),
	practitioner: `${who}0000000000`,
	practitionerName: who === "p1" ? "Ana" : "Dan",
	mode,
});

function render(over: Partial<SlotPickerProps> = {}): string {
	const props: SlotPickerProps = {
		id: "t",
		locale: "ro",
		labels,
		service: { name: "Evaluare", durationMinutes: 60 },
		timeZone: ZONE,
		today: "2026-11-12",
		week: "2026-11-09",
		slots: [
			at("2026-11-13T07:00:00Z"),
			at("2026-11-13T09:15:00Z"),
			at("2026-11-13T14:30:00Z"),
			at("2026-11-14T08:00:00Z"),
		],
		day: "2026-11-13",
		mode: "onsite",
		modes: ["onsite"],
		who: "",
		practitioners: [{ id: "p10000000000", name: "Ana" }],
		actions: { change: "@post('/x')", next: "@post('/x?week=2026-11-16')" },
		...over,
	};
	return (<SlotPicker {...props} />).toString() as string;
}

const dayInputs = (html: string) =>
	[...html.matchAll(/<input[^>]*name="day"[^>]*>/g)].map((m) => m[0]);
const timeInputs = (html: string) =>
	[...html.matchAll(/<input[^>]*name="slot"[^>]*>/g)].map((m) => m[0]);

describe("the slot picker", () => {
	it("shows the service and its length on top", () => {
		const html = render();
		expect(html).toContain("Evaluare");
		expect(html).toContain("60 min");
	});

	it("draws seven days, today marked, days without times disabled", () => {
		const days = dayInputs(render());
		expect(days).toHaveLength(7);
		expect(days.filter((d) => !d.includes("disabled"))).toHaveLength(2);
		expect(render()).toMatch(/pz-day" data-today=""/);
		// The selected day is the one checked.
		expect(days.find((d) => d.includes('value="2026-11-13"'))).toContain("checked");
	});

	it("lists the selected day's times by part of the day, as radio buttons in a group", () => {
		const html = render();
		expect(html).toContain("Dimineața");
		expect(html).toContain("După-amiaza");
		expect(html).not.toContain("Seara");
		const times = timeInputs(html);
		expect(times).toHaveLength(3);
		expect(times.every((t) => t.includes('type="radio"'))).toBe(true);
		expect(html).toContain("09:00");
		expect(html).toContain("11:15");
		expect(html).toContain("16:30");
	});

	it("with one time, draws exactly one button", () => {
		const html = render({ slots: [at("2026-11-13T07:00:00Z")] });
		expect(timeInputs(html)).toHaveLength(1);
		expect(dayInputs(html).filter((d) => !d.includes("disabled"))).toHaveLength(1);
	});

	it("marks the chosen time, and says it in a live region that is always there", () => {
		const chosen = at("2026-11-13T09:15:00Z");
		const html = render({ selected: chosen.id });
		const checked = timeInputs(html).filter((t) => t.includes("checked"));
		expect(checked).toHaveLength(1);
		expect(checked[0]).toContain(`value="${chosen.id}"`);
		expect(html).toMatch(/id="t-live"[^>]*aria-live="polite"/);
		expect(html).toContain("11:15");
		expect(html).toContain("cu Ana");
		const none = render();
		expect(none).toMatch(/id="t-live"[^>]*aria-live="polite"[^>]*>Alege o oră\./);
	});

	it("offers the mode toggle only when the service has both, and the practitioner filter only with a choice", () => {
		const one = render();
		expect(one).not.toContain('type="radio" name="mode"');
		expect(one).toContain('<input type="hidden" name="mode" value="onsite"');
		expect(one).not.toContain("Oricine");
		const both = render({
			modes: ["onsite", "online"],
			practitioners: [
				{ id: "p10000000000", name: "Ana" },
				{ id: "p20000000000", name: "Dan" },
			],
			who: "p20000000000",
		});
		expect(both).toContain("La cabinet");
		expect(both).toContain("Online");
		expect(both).toContain("Oricine");
		expect(both).toContain("Dan");
		const radios = [...both.matchAll(/<input[^>]*name="mode"[^>]*>/g)].map((m) => m[0]);
		expect(radios).toHaveLength(2);
		expect(radios.filter((r) => r.includes("checked"))).toHaveLength(1);
		const who = [...both.matchAll(/<input[^>]*name="who"[^>]*>/g)].map((m) => m[0]);
		expect(who.find((r) => r.includes("checked"))).toContain('value="p20000000000"');
	});

	it("an empty week says so and offers the first week with times, and the call", () => {
		const html = render({
			slots: [],
			nextWithTimes: "2026-11-23",
			actions: { change: "c", jump: "j" },
		});
		expect(html).toContain("Nu mai sunt ore în această săptămână.");
		expect(html).toContain("Prima săptămână cu ore: 23–29 nov");
		expect(dayInputs(html).every((d) => d.includes("disabled"))).toBe(true);
		expect(timeInputs(html)).toHaveLength(0);
		const without = render({ slots: [], actions: { change: "c" } });
		expect(without).not.toContain("Prima săptămână");
	});

	it("announces a time taken meanwhile as an alert", () => {
		expect(render({ taken: true })).toMatch(/role="alert"[^>]*>Ora tocmai s-a ocupat\./);
		expect(render()).not.toContain('role="alert"');
	});

	it("disables a week step that has nowhere to go", () => {
		const html = render();
		const prev = /<button[^>]*aria-label="Săptămâna anterioară"[^>]*>/.exec(html)?.[0] ?? "";
		const next = /<button[^>]*aria-label="Săptămâna următoare"[^>]*>/.exec(html)?.[0] ?? "";
		expect(prev).toContain("disabled");
		expect(next).not.toContain("disabled");
		expect(next).toContain("@post(");
	});

	it("wires every control to the one change expression", () => {
		const html = render({ modes: ["onsite", "online"] });
		const wired = html.match(/data-on:change="@post\(&#39;\/x&#39;\)"/g) ?? [];
		// 7 days + 3 times + 2 modes
		expect(wired.length).toBe(12);
	});

	it("draws the compact variant for a conversation bubble, and ids never collide", () => {
		expect(render({ variant: "compact" })).toContain("pz-slots--compact");
		expect(render()).not.toContain("pz-slots--compact");
		expect(render({ id: "a" })).toContain('id="a-picker"');
		expect(render({ id: "b" })).toContain('id="b-picker"');
	});

	it("renders English dates and a week range across a month", () => {
		const html = render({ locale: "en", week: "2026-11-30", today: "2026-11-30", slots: [] });
		expect(html).toContain("30 Nov – 6 Dec");
	});
});

describe("the service cards", () => {
	it("one radio per service, the chosen one checked", () => {
		const html = (
			<ServiceCards
				id="t"
				legend="Alege serviciul"
				selected="b-b"
				duration={(n) => `${n} min`}
				change="c"
				services={[
					{ slug: "a-a", name: "Evaluare", durationMinutes: 60, modes: "La cabinet" },
					{ slug: "b-b", name: "Ședință online", durationMinutes: 45, modes: "Online" },
				]}
			/>
		).toString() as string;
		const radios = [...html.matchAll(/<input[^>]*name="service"[^>]*>/g)].map((m) => m[0]);
		expect(radios).toHaveLength(2);
		expect(radios.filter((r) => r.includes("checked"))).toHaveLength(1);
		expect(html).toContain("45 min · Online");
	});
});
