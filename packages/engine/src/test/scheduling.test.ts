import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine, type Engine } from "../engine";
import { SchedulingPortSchema } from "../scheduling/port";
import {
	CANCEL_REQUEST_TOOL,
	createSchedulingRegistryTools,
	createSchedulingTools,
	FIND_AVAILABILITY_TOOL,
	REQUEST_APPOINTMENT_TOOL,
	runFindAvailability,
	runRequestAppointment,
	SCHEDULING_TOOL_IDS,
	schedulingInputSchemas,
} from "../scheduling/tools";
import { FakeKnowledge, MemorySchedulingStore } from "../testing";
import { BIKES, GERMAN, TOURS } from "./consumer-profiles";

const SCOPE = { tenant: "harbour", services: ["bike-fitting"] };
const H = 3_600_000;
const NOW = Date.parse("2026-10-20T06:00:00Z");

/** A Bucharest-zone calendar on both sides of the October change (UTC+3, then UTC+2). */
function store(): MemorySchedulingStore {
	return new MemorySchedulingStore().offer("harbour", "bike-fitting", [
		{
			id: "p1.a.onsite",
			start: Date.parse("2026-10-22T06:00:00Z"),
			end: Date.parse("2026-10-22T07:00:00Z"),
			practitionerName: "DEMO Fitter",
			modes: ["onsite"],
		},
		{
			id: "p1.b.onsite",
			start: Date.parse("2026-10-22T12:00:00Z"),
			end: Date.parse("2026-10-22T13:00:00Z"),
			practitionerName: "DEMO Fitter",
			modes: ["onsite"],
		},
		{
			id: "p1.c.online",
			start: Date.parse("2026-10-26T07:00:00Z"),
			end: Date.parse("2026-10-26T08:00:00Z"),
			practitionerName: "DEMO Fitter",
			modes: ["online"],
		},
	]);
}

const BOOKING_FIELDS = ["name", "phone", "email", "contact", "reason", "notes", "symptoms"];

describe("the scheduling tools", () => {
	it("are exactly three, none of which books, and take no personal data", () => {
		const tools = createSchedulingTools(store(), SCOPE);
		expect(Object.keys(tools).sort()).toEqual([...SCHEDULING_TOOL_IDS].sort());
		expect(
			Object.values(tools)
				.map((t) => t.id)
				.sort(),
		).toEqual([FIND_AVAILABILITY_TOOL, REQUEST_APPOINTMENT_TOOL, CANCEL_REQUEST_TOOL].sort());
		const schemas = schedulingInputSchemas(SCOPE.services);
		const cases = [
			{ schema: schemas.find, input: { service: "bike-fitting" } },
			{
				schema: schemas.request,
				input: {
					service: "bike-fitting",
					slotId: "p1.a.onsite",
					startsAt: "2026-10-22T06:00:00.000Z",
				},
			},
			{
				schema: schemas.cancel,
				input: { reference: "K7M3-9QXA", cancelCode: "AAAA-BBBB-CCCC-DDDD" },
			},
		];
		for (const { schema, input } of cases) {
			expect(schema.safeParse(input).success).toBe(true);
			for (const field of BOOKING_FIELDS) {
				expect(schema.safeParse({ ...input, [field]: "x" }).success, `takes ${field}`).toBe(false);
			}
		}
		expect(schemas.find.safeParse({ service: "massage" }).success).toBe(false);
	});

	it("propose free times on the practice's wall clock, across the autumn change", async () => {
		const found = await runFindAvailability(
			store(),
			SCOPE,
			{ service: "bike-fitting", days: 7, partOfDay: "any", limit: 6, fromDate: "2026-10-21" },
			NOW,
		);
		expect(found.status).toBe("ok");
		expect(found.slots.map((s) => `${s.date} ${s.time} ${s.weekday} ${s.mode}`)).toEqual([
			"2026-10-22 09:00 4 onsite",
			"2026-10-22 15:00 4 onsite",
			"2026-10-26 09:00 1 online",
		]);
		const mornings = await runFindAvailability(
			store(),
			SCOPE,
			{
				service: "bike-fitting",
				days: 7,
				partOfDay: "afternoon",
				limit: 6,
				fromDate: "2026-10-21",
			},
			NOW,
		);
		expect(mornings.slots.map((s) => s.time)).toEqual(["15:00"]);
	});

	it("requestAppointment writes nothing and only ever returns a proposal to confirm in the app", async () => {
		const memory = store();
		const proposal = await runRequestAppointment(memory, SCOPE, {
			service: "bike-fitting",
			slotId: "p1.a.onsite",
			startsAt: "2026-10-22T06:00:00.000Z",
		});
		expect(proposal).toMatchObject({
			status: "needs_confirmation",
			booked: false,
			proposal: { time: "09:00" },
		});
		expect(memory.calls.map((c) => c.method)).toEqual(["findSlots"]);
		memory.take("harbour", "bike-fitting", "p1.a.onsite");
		expect(
			await runRequestAppointment(memory, SCOPE, {
				service: "bike-fitting",
				slotId: "p1.a.onsite",
				startsAt: "2026-10-22T06:00:00.000Z",
			}),
		).toEqual({ status: "no_longer_free", booked: false });
		// A slot id with the wrong time is not that slot.
		expect(
			await runRequestAppointment(store(), SCOPE, {
				service: "bike-fitting",
				slotId: "p1.a.onsite",
				startsAt: "2026-10-22T07:00:00.000Z",
			}),
		).toEqual({ status: "no_longer_free", booked: false });
	});

	it("cancel needs the code; a store failure is `unavailable`, never a throw", async () => {
		const memory = store().addRequest("K7M3-9QXA", "AAAA-BBBB-CCCC-DDDD", NOW + 48 * H);
		const tools = createSchedulingTools(memory, SCOPE);
		const wrong = await tools[CANCEL_REQUEST_TOOL].execute?.(
			{ reference: "K7M3-9QXA", cancelCode: "ZZZZ-ZZZZ-ZZZZ-ZZZZ" },
			{},
		);
		expect(wrong).toEqual({ status: "not_found" });
		const right = await tools[CANCEL_REQUEST_TOOL].execute?.(
			{ reference: "K7M3-9QXA", cancelCode: "AAAA-BBBB-CCCC-DDDD" },
			{},
		);
		expect(right).toMatchObject({ status: "cancelled" });
		expect(memory.isCancelled("K7M3-9QXA")).toBe(true);
		memory.failing = true;
		expect(
			await runFindAvailability(
				memory,
				SCOPE,
				{ service: "bike-fitting", days: 7, partOfDay: "any", limit: 6 },
				NOW,
			),
		).toEqual({
			status: "unavailable",
			slots: [],
		});
	});

	it("refuse a personal field at execution too, bound to an agent or in the registry", async () => {
		const memory = store();
		const bound = createSchedulingTools(memory, SCOPE);
		const registry = createSchedulingRegistryTools(memory, { "harbour-bikes": SCOPE });
		const slot = {
			service: "bike-fitting",
			slotId: "p1.a.onsite",
			startsAt: "2026-10-22T06:00:00.000Z",
		};
		const withPhone = { ...slot, phone: "0700 000 000" };
		const withEmail = { ...slot, profile: "harbour-bikes", email: "a@b.ro" };
		expect(await bound[REQUEST_APPOINTMENT_TOOL].execute?.(withPhone, {})).toMatchObject({
			error: true,
		});
		expect(await registry[REQUEST_APPOINTMENT_TOOL].execute?.(withEmail, {})).toMatchObject({
			error: true,
		});
		expect(
			await registry[REQUEST_APPOINTMENT_TOOL].execute?.({ ...slot, profile: "harbour-bikes" }, {}),
		).toMatchObject({ status: "needs_confirmation", booked: false });
		expect(memory.calls.map((c) => c.method)).toEqual(["findSlots"]);
	});

	it("the port schema accepts a store with only findSlots and cancel", () => {
		expect(SchedulingPortSchema.safeParse(store()).success).toBe(true);
		expect(SchedulingPortSchema.safeParse({ findSlots: () => undefined }).success).toBe(false);
	});
});

describe("scheduling in the engine", () => {
	let engine: Engine;

	beforeEach(() => {
		vi.stubEnv("OPENROUTER_API_KEY", "");
		engine = createEngine({
			profiles: [{ ...BIKES, scheduling: SCOPE }, TOURS],
			languages: [GERMAN],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model" },
			idPrefix: "acme",
			scheduling: store(),
		});
	});

	afterEach(() => vi.unstubAllEnvs());

	it("gives an opted-in profile a separate scheduling agent; the grounded agent holds only knowledge tools", async () => {
		const bikes = engine.guide("harbour-bikes");
		expect(bikes.scheduling?.agent.id).toBe("acme-harbour-bikes-scheduling");
		expect(Object.keys(await bikes.agent.listTools())).toEqual(["searchKnowledge"]);
		expect(Object.keys((await bikes.scheduling?.agent.listTools()) ?? {}).sort()).toEqual(
			[...SCHEDULING_TOOL_IDS].sort(),
		);
		expect(engine.guide("harbour-tours").scheduling).toBeUndefined();
	});

	it("registers the scheduling tools and agent on the Mastra instance, beside searchKnowledge", () => {
		expect(Object.keys(engine.mastra.listTools() ?? {}).sort()).toEqual(
			["searchKnowledge", ...SCHEDULING_TOOL_IDS].sort(),
		);
		expect(Object.keys(engine.mastra.listAgents())).toContain("harbour-bikes-scheduling");
	});

	it("tells the scheduling agent to propose only, and never to ask for health or contact details", async () => {
		const instructions = await engine.guide("harbour-bikes").scheduling?.agent.getInstructions();
		const text = typeof instructions === "string" ? instructions : JSON.stringify(instructions);
		expect(text).toContain("It books nothing");
		expect(text).toContain("Never ask why they want the appointment");
		expect(text).toContain("Never ask for a name, a phone number or an e-mail address");
	});

	it("without a store there is no scheduling at all, and the profile still parses", () => {
		const plain = createEngine({
			profiles: [{ ...BIKES, scheduling: SCOPE }],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model" },
		});
		expect(plain.guide("harbour-bikes").scheduling).toBeUndefined();
		expect(Object.keys(plain.mastra.listTools() ?? {})).toEqual(["searchKnowledge"]);
	});
});
