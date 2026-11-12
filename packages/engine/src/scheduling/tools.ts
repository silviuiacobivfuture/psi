import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { within } from "../deadline";
import { addLocalDays, wallTime } from "./local-time";
import {
	type ProfileScheduling,
	SchedulingCancelSchema,
	SchedulingModeSchema,
	type SchedulingPort,
	type SchedulingSlot,
	SchedulingSlotsSchema,
} from "./port";

/**
 * The scheduling tools, generic and brand-agnostic. The model may only PROPOSE: `findAvailability`
 * lists free times, `requestAppointment` checks one is still free and returns a proposal the app
 * renders as its own confirm step (a form the person submits, in another request), and
 * `cancelRequest` needs the cancel code the person was shown. No tool creates a hold or a
 * request, and no input takes a name, a phone number, an e-mail address or a reason for the visit.
 */

export const FIND_AVAILABILITY_TOOL = "findAvailability";
export const REQUEST_APPOINTMENT_TOOL = "requestAppointment";
export const CANCEL_REQUEST_TOOL = "cancelRequest";
export const SCHEDULING_TOOL_IDS = [
	FIND_AVAILABILITY_TOOL,
	REQUEST_APPOINTMENT_TOOL,
	CANCEL_REQUEST_TOOL,
] as const;

/** Deadline for one store call from a tool. */
export const SCHEDULING_TIMEOUT_MS = 5_000;
const DAY_MS = 86_400_000;

const PART_OF_DAY = {
	morning: [0, 720],
	afternoon: [720, 1020],
	evening: [1020, 1440],
	any: [0, 1440],
} as const;

export const ProposedSlotSchema = z.object({
	slotId: z.string(),
	startsAt: z.string().datetime(),
	date: z.string(),
	time: z.string(),
	weekday: z.number().int().min(1).max(7),
	durationMinutes: z.number().int().positive(),
	mode: SchedulingModeSchema,
	practitioner: z.string(),
});
export type ProposedSlot = z.infer<typeof ProposedSlotSchema>;

export const FindAvailabilityOutputSchema = z.object({
	status: z.enum(["ok", "none", "unknown_service", "unavailable"]),
	timeZone: z.string().optional(),
	slots: z.array(ProposedSlotSchema).readonly(),
});
export type FindAvailabilityOutput = z.infer<typeof FindAvailabilityOutputSchema>;

export const RequestAppointmentOutputSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("needs_confirmation"),
		/** Nothing is held or booked: the app shows this to the person, who confirms in its form. */
		booked: z.literal(false),
		service: z.string(),
		proposal: ProposedSlotSchema,
	}),
	z.object({
		status: z.enum(["no_longer_free", "unknown_service", "unavailable"]),
		booked: z.literal(false),
	}),
]);
export type RequestAppointmentOutput = z.infer<typeof RequestAppointmentOutputSchema>;

export const CancelRequestOutputSchema = z.object({
	status: z.enum(["cancelled", "not_found", "not_cancellable", "unavailable"]),
	startsAt: z.string().datetime().optional(),
});
export type CancelRequestOutput = z.infer<typeof CancelRequestOutputSchema>;

function enumOf(values: ReadonlyArray<string>): z.ZodEnum<[string, ...string[]]> {
	const [first, ...rest] = values;
	return z.enum([first ?? "none", ...rest]);
}

/** A service key: one of the profile's list when it has one, else any well-formed key (the store checks it). */
function serviceSlug(services: ReadonlyArray<string>) {
	return services.length === 0 ? z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/) : enumOf(services);
}

function findAvailabilityInput(services: ReadonlyArray<string>) {
	return z
		.object({
			service: serviceSlug(services).describe("The service to find times for"),
			fromDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional()
				.describe("First day to look at, YYYY-MM-DD, local to the practice; defaults to today"),
			days: z.number().int().min(1).max(14).default(7).describe("How many days to look at"),
			partOfDay: z.enum(["morning", "afternoon", "evening", "any"]).default("any"),
			weekday: z
				.number()
				.int()
				.min(1)
				.max(7)
				.optional()
				.describe("Only this day of the week (1 Monday to 7 Sunday), when the visitor named one"),
			mode: SchedulingModeSchema.optional().describe("onsite or online, when the visitor said"),
			limit: z.number().int().min(1).max(10).default(6),
		})
		.strict();
}

function requestAppointmentInput(services: ReadonlyArray<string>) {
	return z
		.object({
			service: serviceSlug(services),
			slotId: z.string().min(1).max(200).describe("The slotId findAvailability returned"),
			startsAt: z
				.string()
				.datetime()
				.describe("The startsAt findAvailability returned with that slotId"),
		})
		.strict();
}

export const CancelRequestInputSchema = z
	.object({
		reference: z.string().min(8).max(12).describe("The booking reference the visitor gave"),
		cancelCode: z.string().min(16).max(24).describe("The cancel code the visitor gave"),
	})
	.strict();

type FindInput = z.infer<ReturnType<typeof findAvailabilityInput>>;
type RequestInput = z.infer<ReturnType<typeof requestAppointmentInput>>;

/** The tools' input schemas for a list of services: strict, and without a single personal field. */
export interface SchedulingInputSchemas {
	find: z.ZodType<FindInput, z.ZodTypeDef, unknown>;
	request: z.ZodType<RequestInput, z.ZodTypeDef, unknown>;
	cancel: typeof CancelRequestInputSchema;
}

export function schedulingInputSchemas(services: ReadonlyArray<string>): SchedulingInputSchemas {
	return {
		find: findAvailabilityInput(services),
		request: requestAppointmentInput(services),
		cancel: CancelRequestInputSchema,
	};
}

function propose(slot: SchedulingSlot, timeZone: string): ReadonlyArray<ProposedSlot> {
	const wall = wallTime(slot.start, timeZone);
	return slot.modes.map((mode) => ({
		slotId: slot.id,
		startsAt: new Date(slot.start).toISOString(),
		date: wall.date,
		time: wall.time,
		weekday: wall.weekday,
		durationMinutes: Math.round((slot.end - slot.start) / 60_000),
		mode,
		practitioner: slot.practitionerName,
	}));
}

async function search(port: SchedulingPort, query: Parameters<SchedulingPort["findSlots"]>[0]) {
	return SchedulingSlotsSchema.parse(
		await within(port.findSlots(query), SCHEDULING_TIMEOUT_MS, "findSlots"),
	);
}

/** Free times for one service, filtered to the asked days and part of the day, on the wall clock. */
export async function runFindAvailability(
	port: SchedulingPort,
	scope: ProfileScheduling,
	input: FindInput,
	now: number = Date.now(),
): Promise<FindAvailabilityOutput> {
	try {
		const firstDay = input.fromDate ?? new Date(now).toISOString().slice(0, 10);
		const lastDay = addLocalDays(firstDay, input.days);
		const from = Math.max(now, Date.parse(`${firstDay}T00:00:00Z`) - DAY_MS);
		const found = await search(port, {
			tenant: scope.tenant,
			service: input.service,
			from,
			to: Date.parse(`${lastDay}T00:00:00Z`) + DAY_MS,
			...(input.mode === undefined ? {} : { mode: input.mode }),
		});
		if (!found.ok) return { status: "unknown_service", slots: [] };
		const [low, high] = PART_OF_DAY[input.partOfDay];
		const slots = found.slots
			.flatMap((slot) => propose(slot, found.timeZone))
			.filter((slot) => slot.date >= firstDay && slot.date < lastDay)
			.filter((slot) => (input.mode === undefined ? true : slot.mode === input.mode))
			.filter((slot) => (input.weekday === undefined ? true : slot.weekday === input.weekday))
			.filter((slot) => {
				const minutes = Number(slot.time.slice(0, 2)) * 60 + Number(slot.time.slice(3));
				return minutes >= low && minutes < high;
			})
			.slice(0, input.limit);
		return { status: slots.length === 0 ? "none" : "ok", timeZone: found.timeZone, slots };
	} catch {
		return { status: "unavailable", slots: [] };
	}
}

/**
 * Checks the chosen slot is still free and returns it as a proposal. It writes nothing: the app
 * renders the proposal as its confirm step, and only the person's submit there creates a request.
 */
export async function runRequestAppointment(
	port: SchedulingPort,
	scope: ProfileScheduling,
	input: RequestInput,
): Promise<RequestAppointmentOutput> {
	try {
		const start = Date.parse(input.startsAt);
		const found = await search(port, {
			tenant: scope.tenant,
			service: input.service,
			from: start,
			to: start + 1,
		});
		if (!found.ok) return { status: "unknown_service", booked: false };
		const proposal = found.slots
			.filter((slot) => slot.id === input.slotId && slot.start === start)
			.flatMap((slot) => propose(slot, found.timeZone))[0];
		if (proposal === undefined) return { status: "no_longer_free", booked: false };
		return { status: "needs_confirmation", booked: false, service: input.service, proposal };
	} catch {
		return { status: "unavailable", booked: false };
	}
}

/** Cancels a request with the reference and the cancel code the person holds. */
export async function runCancelRequest(
	port: SchedulingPort,
	input: z.infer<typeof CancelRequestInputSchema>,
): Promise<CancelRequestOutput> {
	try {
		const done = SchedulingCancelSchema.parse(
			await within(port.cancel(input), SCHEDULING_TIMEOUT_MS, "cancel"),
		);
		if (done.ok) return { status: "cancelled", startsAt: new Date(done.start).toISOString() };
		return { status: done.reason === "not_found" ? "not_found" : "not_cancellable" };
	} catch {
		return { status: "unavailable" };
	}
}

const DESCRIPTIONS = {
	find: "Find free times for a service. Returns slots with slotId and startsAt, and the local date and time to say. Propose only these.",
	request:
		"When the visitor picks one of the returned times: check it is still free and show them the confirmation form. This books nothing; the visitor confirms in the form.",
	cancel:
		"Cancel a request when the visitor asks and gives both their booking reference and cancel code.",
} as const;

function buildTools(port: SchedulingPort, scope: ProfileScheduling) {
	return {
		[FIND_AVAILABILITY_TOOL]: createTool({
			id: FIND_AVAILABILITY_TOOL,
			description: DESCRIPTIONS.find,
			inputSchema: findAvailabilityInput(scope.services),
			outputSchema: FindAvailabilityOutputSchema,
			execute: async (input): Promise<FindAvailabilityOutput> =>
				runFindAvailability(port, scope, input),
		}),
		[REQUEST_APPOINTMENT_TOOL]: createTool({
			id: REQUEST_APPOINTMENT_TOOL,
			description: DESCRIPTIONS.request,
			inputSchema: requestAppointmentInput(scope.services),
			outputSchema: RequestAppointmentOutputSchema,
			execute: async (input): Promise<RequestAppointmentOutput> =>
				runRequestAppointment(port, scope, input),
		}),
		[CANCEL_REQUEST_TOOL]: createTool({
			id: CANCEL_REQUEST_TOOL,
			description: DESCRIPTIONS.cancel,
			inputSchema: CancelRequestInputSchema,
			outputSchema: CancelRequestOutputSchema,
			execute: async (input): Promise<CancelRequestOutput> => runCancelRequest(port, input),
		}),
	};
}

/** The three tools, bound to one profile's tenant and services: what its scheduling agent holds. */
export type SchedulingTools = ReturnType<typeof buildTools>;

export function createSchedulingTools(
	port: SchedulingPort,
	scope: ProfileScheduling,
): SchedulingTools {
	return buildTools(port, scope);
}

function buildRegistryTools(
	port: SchedulingPort,
	scopes: Readonly<Record<string, ProfileScheduling>>,
) {
	const ids = Object.keys(scopes);
	const services = [...new Set(Object.values(scopes).flatMap((s) => s.services))];
	const profile = enumOf(ids).describe("The profile whose calendar to use");
	const scopeOf = (id: string): ProfileScheduling => scopes[id] ?? { tenant: id, services: [] };
	return {
		[FIND_AVAILABILITY_TOOL]: createTool({
			id: FIND_AVAILABILITY_TOOL,
			description: `${DESCRIPTIONS.find} (Studio: pick the profile.)`,
			inputSchema: findAvailabilityInput(services).extend({ profile }).strict(),
			outputSchema: FindAvailabilityOutputSchema,
			execute: async ({ profile: id, ...input }): Promise<FindAvailabilityOutput> =>
				scopeOf(id).services.includes(input.service)
					? runFindAvailability(port, scopeOf(id), input)
					: { status: "unknown_service", slots: [] },
		}),
		[REQUEST_APPOINTMENT_TOOL]: createTool({
			id: REQUEST_APPOINTMENT_TOOL,
			description: `${DESCRIPTIONS.request} (Studio: pick the profile.)`,
			inputSchema: requestAppointmentInput(services).extend({ profile }).strict(),
			outputSchema: RequestAppointmentOutputSchema,
			execute: async ({ profile: id, ...input }): Promise<RequestAppointmentOutput> =>
				scopeOf(id).services.includes(input.service)
					? runRequestAppointment(port, scopeOf(id), input)
					: { status: "unknown_service", booked: false },
		}),
		[CANCEL_REQUEST_TOOL]: createTool({
			id: CANCEL_REQUEST_TOOL,
			description: DESCRIPTIONS.cancel,
			inputSchema: CancelRequestInputSchema,
			outputSchema: CancelRequestOutputSchema,
			execute: async (input): Promise<CancelRequestOutput> => runCancelRequest(port, input),
		}),
	};
}

/** The tools as the Mastra instance registers them (Studio), with the profile as an input. */
export type SchedulingRegistryTools = ReturnType<typeof buildRegistryTools>;

export function createSchedulingRegistryTools(
	port: SchedulingPort,
	scopes: Readonly<Record<string, ProfileScheduling>>,
): SchedulingRegistryTools {
	return buildRegistryTools(port, scopes);
}
