import { encodeSlot } from "@psi/scheduling";
import { ANA, DAN, type Free, NOW, store } from "@psi/scheduling/testing";
import { describe, expect, it } from "vitest";
import { createPicker, HORIZON_WEEKS, PickerChoices, type PickerView } from "./picker";

const FRI_9 = Date.parse("2026-11-13T07:00:00Z");
const FRI_11 = Date.parse("2026-11-13T09:00:00Z");
const NEXT_TUE = Date.parse("2026-11-17T08:00:00Z");
const ONSITE: Free[] = [
	{ service: "evaluation", practitioner: ANA, start: FRI_9, mode: "onsite" },
	{ service: "evaluation", practitioner: DAN, start: FRI_9, mode: "onsite" },
	{ service: "evaluation", practitioner: ANA, start: FRI_11, mode: "onsite" },
	{ service: "evaluation", practitioner: ANA, start: FRI_11, mode: "online" },
	{ service: "evaluation", practitioner: ANA, start: NEXT_TUE, mode: "onsite" },
	{ service: "therapy", practitioner: ANA, start: FRI_9, mode: "onsite" },
];

const choices = (over: Record<string, string> = {}) => PickerChoices.parse(over);
async function ready(picker: ReturnType<typeof createPicker>, over: Record<string, string> = {}) {
	const view: PickerView = await picker.view(choices(over));
	if (view.kind !== "ready") throw new Error("expected a ready view");
	return view.data;
}
const make = (free: Free[], options = {}) =>
	createPicker(store(free, options).client, "psizone", () => NOW);

describe("the picker's view of the store", () => {
	it("opens on this week, on the first day with times, in the default mode", async () => {
		const data = await ready(make(ONSITE));
		expect(data.week).toBe("2026-11-09");
		expect(data.day).toBe("2026-11-13");
		expect(data.mode).toBe("onsite");
		expect(data.service.slug).toBe("evaluation");
		expect(data.slots.map((s) => s.start)).toEqual([FRI_9, FRI_9, FRI_11]);
		expect(data.prevWeek).toBeUndefined();
		expect(data.nextWeek).toBe("2026-11-16");
	});

	it("asks the store for one mode only and filters by practitioner", async () => {
		const data = await ready(make(ONSITE), { mode: "online" });
		expect(data.mode).toBe("online");
		expect(data.slots).toHaveLength(1);
		const ana = await ready(make(ONSITE), { who: DAN });
		expect(ana.slots.map((s) => s.practitioner)).toEqual([DAN]);
	});

	it("drops a mode the service does not offer and a practitioner it does not have", async () => {
		const data = await ready(make(ONSITE), {
			service: "therapy",
			shown: "therapy",
			mode: "online",
			who: DAN,
		});
		expect(data.mode).toBe("onsite");
		expect(data.who).toBe("");
	});

	it("shows the chosen week, clamps it to the horizon and never shows a past week", async () => {
		const picker = make(ONSITE);
		expect((await ready(picker, { week: "2026-11-18" })).week).toBe("2026-11-16");
		expect((await ready(picker, { week: "2020-01-01" })).week).toBe("2026-11-09");
		const far = await ready(picker, { week: "2099-01-01" });
		expect(far.week).toBe("2027-02-01");
		expect(far.nextWeek).toBeUndefined();
		expect(HORIZON_WEEKS).toBe(12);
	});

	it("an empty week offers the first week that has times", async () => {
		const data = await ready(make(ONSITE), { week: "2026-11-23" });
		expect(data.slots).toHaveLength(0);
		expect(data.nextWithTimes).toBeUndefined();
		const earlier = await ready(make(ONSITE), {
			week: "2026-11-09",
			mode: "online",
		});
		expect(earlier.nextWithTimes).toBeUndefined();
		const gap = await ready(
			make([
				{
					service: "evaluation",
					practitioner: ANA,
					start: Date.parse("2026-12-01T08:00:00Z"),
					mode: "onsite",
				},
			]),
		);
		expect(gap.slots).toHaveLength(0);
		expect(gap.nextWithTimes).toBe("2026-11-30");
	});

	it("a service the store does not have falls back to the default, never to a guess", async () => {
		const data = await ready(make(ONSITE), { service: "nope-nope" });
		expect(data.service.slug).toBe("evaluation");
	});

	it("starts over when another service is chosen", async () => {
		const id = encodeSlot({ practitioner: ANA, start: FRI_9, mode: "onsite" });
		const data = await ready(make(ONSITE), {
			service: "therapy",
			shown: "evaluation",
			slot: id,
			week: "2026-11-16",
		});
		expect(data.week).toBe("2026-11-09");
		expect(data.selected).toBeUndefined();
		expect(data.taken).toBe(false);
	});
});

describe("a slot id from the browser is never trusted", () => {
	const real = encodeSlot({ practitioner: ANA, start: FRI_11, mode: "onsite" });

	it("is chosen only when this answer has it free", async () => {
		const data = await ready(make(ONSITE), { slot: real });
		expect(data.selected).toBe(real);
		expect(data.day).toBe("2026-11-13");
	});

	it("a well-formed id that is not free is 'taken', and nothing is selected", async () => {
		const forged = encodeSlot({
			practitioner: ANA,
			start: Date.parse("2026-11-13T10:00:00Z"),
			mode: "onsite",
		});
		const data = await ready(make(ONSITE), { slot: forged });
		expect(data.selected).toBeUndefined();
		expect(data.taken).toBe(true);
	});

	it("an id for another practitioner's free time is not selected under a filter that excludes it", async () => {
		const data = await ready(make(ONSITE), { slot: real, who: DAN });
		expect(data.selected).toBeUndefined();
		expect(data.taken).toBe(false);
	});

	it("a real slot of another service is not free for this one", async () => {
		const others = [
			{
				service: "therapy",
				practitioner: ANA,
				start: FRI_9,
				mode: "onsite" as const,
			},
		];
		const id = encodeSlot({ practitioner: ANA, start: FRI_9, mode: "onsite" });
		const data = await ready(make(others), { service: "evaluation", slot: id });
		expect(data.selected).toBeUndefined();
		expect(data.taken).toBe(true);
	});

	it("an id for a mode that is not shown is dropped without a notice", async () => {
		const online = encodeSlot({
			practitioner: ANA,
			start: FRI_11,
			mode: "online",
		});
		const data = await ready(make(ONSITE), { slot: online, mode: "onsite" });
		expect(data.selected).toBeUndefined();
		expect(data.taken).toBe(false);
	});

	it("garbage is the same as nothing", async () => {
		for (const slot of ["", "x", "../../etc", "a".repeat(500), "ana.1.onsite"]) {
			const data = await ready(make(ONSITE), { slot });
			expect(data.selected).toBeUndefined();
			expect(data.taken).toBe(false);
		}
	});

	it("a selected time on another day than the one shown is dropped", async () => {
		const sat = Date.parse("2026-11-14T08:00:00Z");
		const free: Free[] = [
			...ONSITE,
			{ service: "evaluation", practitioner: ANA, start: sat, mode: "onsite" },
		];
		const data = await ready(make(free), { slot: real, day: "2026-11-14" });
		expect(data.day).toBe("2026-11-14");
		expect(data.selected).toBeUndefined();
	});

	it("a past time is never offered", async () => {
		const past = Date.parse("2026-11-12T06:00:00Z");
		const data = await ready(
			make([
				...ONSITE,
				{
					service: "evaluation",
					practitioner: ANA,
					start: past,
					mode: "onsite",
				},
			]),
		);
		expect(data.slots.some((s) => s.start === past)).toBe(false);
	});
});

describe("what the form may send", () => {
	it("turns anything malformed into an empty choice, never an error", () => {
		const parsed = PickerChoices.parse({
			service: "Bad Service!",
			week: "2026-13-45",
			day: "tomorrow",
			mode: "teleport",
			who: "<script>",
			slot: "x".repeat(300),
		});
		expect(parsed).toEqual({
			service: "",
			shown: "",
			week: "",
			day: "",
			mode: "",
			who: "",
			slot: "",
		});
	});
});

describe("when the store cannot answer", () => {
	it("is unavailable when it is not configured, unreachable, or has nothing", async () => {
		expect((await createPicker(undefined, "psizone").view(choices())).kind).toBe("unavailable");
		expect((await make(ONSITE, { down: true }).view(choices())).kind).toBe("unavailable");
		expect((await make(ONSITE, { empty: true }).view(choices())).kind).toBe("unavailable");
		expect(await make(ONSITE, { down: true }).services()).toEqual([]);
	});
});
