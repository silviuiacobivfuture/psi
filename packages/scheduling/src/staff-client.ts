import type { z } from "zod";
import { api } from "../convex/_generated/api";
import type { SchedulingConfig } from "./config";
import type { Mode } from "./domain/catalog";
import type { AppointmentStatus } from "./domain/conflicts";
import type { DecisionReason } from "./domain/lifecycle";
import { canonicalCode, makeReference } from "./domain/tokens";
import {
	RawAddRuleSchema,
	RawCalendarSchema,
	RawDecideSchema,
	RawExceptionSchema,
	RawRemoveSchema,
	RawRescheduleSchema,
	RawStaffAvailabilitySchema,
	RawStaffCatalogSchema,
	RawStaffRequestsSchema,
	RawUpdateServiceSchema,
	type StaffRequestSchema,
} from "./results";
import { createTransport, type Transport } from "./transport";

/**
 * A staff member the app has already authorised for this calendar through OpenFGA. `subject` is
 * their identity provider subject; the store records it as `decidedBy`, nothing more.
 */
export interface StaffActor {
	subject: string;
}

export type CalendarResult = z.infer<typeof RawCalendarSchema>;
export type DecideResult = z.infer<typeof RawDecideSchema>;
export type RescheduleResult = z.infer<typeof RawRescheduleSchema>;
export type ExceptionResult = z.infer<typeof RawExceptionSchema>;
/** `staff.catalog`'s answer: every practitioner and service of the tenant, inactive included. */
export type StaffCatalog = z.infer<typeof RawStaffCatalogSchema>;
/** One practitioner's weekly rules and exceptions (from a date on), with their ids. */
export type StaffAvailability = z.infer<typeof RawStaffAvailabilitySchema>;
export type UpdateServiceResult = z.infer<typeof RawUpdateServiceSchema>;
export type AddRuleResult = z.infer<typeof RawAddRuleSchema>;
export type RemoveResult = z.infer<typeof RawRemoveSchema>;
/** One row of the tenant-wide list; it never carries the account hash. */
export type StaffRequest = z.infer<typeof StaffRequestSchema>;
export type StaffRequestsResult = z.infer<typeof RawStaffRequestsSchema>;

/** What `updateService` may change; anything left out stays as it is. */
export interface ServicePatch {
	durationMinutes?: number;
	bufferMinutes?: number;
	minNoticeMinutes?: number;
	horizonDays?: number;
	active?: boolean;
}

/**
 * The team's side of the store. Nothing here checks who the actor is: call it only after
 * `@psi/account`'s `can("viewer" | "editor", …)` allowed it (docs/plans/scheduling.md §5).
 */
export interface StaffSchedulingClient {
	calendar(input: {
		tenant: string;
		practitioner: string;
		from: number;
		to: number;
		actor: StaffActor;
	}): Promise<CalendarResult>;
	decide(input: {
		tenant: string;
		reference: string;
		decision: "confirm" | "decline" | "cancel";
		/** Why, for a decline or a cancel (a closed list, never free text); ignored on confirm. */
		reason?: DecisionReason;
		actor: StaffActor;
	}): Promise<DecideResult>;
	reschedule(input: {
		tenant: string;
		reference: string;
		start: number;
		mode: Mode;
		actor: StaffActor;
	}): Promise<RescheduleResult>;
	addException(input: {
		tenant: string;
		practitioner: string;
		date: string;
		kind: "closed" | "open";
		start?: number;
		end?: number;
		modes?: Mode[];
		actor: StaffActor;
	}): Promise<ExceptionResult>;
	catalog(input: { tenant: string }): Promise<StaffCatalog>;
	availability(input: {
		tenant: string;
		practitioner: string;
		/** `YYYY-MM-DD`: exceptions on or after this local date. */
		fromDate: string;
	}): Promise<StaffAvailability>;
	updateService(input: {
		tenant: string;
		service: string;
		patch: ServicePatch;
		actor: StaffActor;
	}): Promise<UpdateServiceResult>;
	addRule(input: {
		tenant: string;
		practitioner: string;
		/** ISO weekday: Monday 1 … Sunday 7. */
		weekday: number;
		/** Minutes after local midnight. */
		start: number;
		end: number;
		modes: Mode[];
		validFrom?: string;
		validUntil?: string;
		actor: StaffActor;
	}): Promise<AddRuleResult>;
	removeRule(input: {
		tenant: string;
		rule: string;
		actor: StaffActor;
	}): Promise<RemoveResult>;
	removeException(input: {
		tenant: string;
		exception: string;
		actor: StaffActor;
	}): Promise<RemoveResult>;
	/** Requests and appointments in [from, to) (at most 62 days); held and expired unless asked. */
	requests(input: {
		tenant: string;
		from: number;
		to: number;
		statuses?: AppointmentStatus[];
	}): Promise<StaffRequestsResult>;
}

export function createStaffSchedulingClient(
	config: SchedulingConfig,
): StaffSchedulingClient {
	return staffClientOn(createTransport(config));
}

export function staffClientOn(transport: Transport): StaffSchedulingClient {
	const key = transport.serverKey;
	const ref = (typed: string): string => canonicalCode(typed, 8) ?? "";
	return {
		calendar: (input) =>
			transport.call(RawCalendarSchema, (c) =>
				c.query(api.staff.calendar, { key, ...input }),
			),
		decide: (input) =>
			transport.call(RawDecideSchema, (c) =>
				c.mutation(
					api.staff.decide,
					{ key, ...input, reference: ref(input.reference) },
					{ skipQueue: true },
				),
			),
		reschedule: async (input) => {
			for (let attempt = 0; attempt < 2; attempt += 1) {
				const raw = await transport.call(RawRescheduleSchema, (c) =>
					c.mutation(
						api.staff.reschedule,
						{
							key,
							...input,
							reference: ref(input.reference),
							newReference: makeReference(),
						},
						{ skipQueue: true },
					),
				);
				if (raw.ok || raw.reason !== "retry") return raw;
			}
			return { ok: false, reason: "retry" };
		},
		addException: (input) =>
			transport.call(RawExceptionSchema, (c) =>
				c.mutation(
					api.staff.addException,
					{ key, ...input },
					{ skipQueue: true },
				),
			),
		catalog: (input) =>
			transport.call(RawStaffCatalogSchema, (c) =>
				c.query(api.staffCatalog.catalog, { key, ...input }),
			),
		availability: (input) =>
			transport.call(RawStaffAvailabilitySchema, (c) =>
				c.query(api.staffCatalog.availability, { key, ...input }),
			),
		updateService: (input) =>
			transport.call(RawUpdateServiceSchema, (c) =>
				c.mutation(
					api.staffCatalog.updateService,
					{ key, ...input },
					{ skipQueue: true },
				),
			),
		addRule: (input) =>
			transport.call(RawAddRuleSchema, (c) =>
				c.mutation(
					api.staffCatalog.addRule,
					{ key, ...input },
					{ skipQueue: true },
				),
			),
		removeRule: (input) =>
			transport.call(RawRemoveSchema, (c) =>
				c.mutation(
					api.staffCatalog.removeRule,
					{ key, ...input },
					{ skipQueue: true },
				),
			),
		removeException: (input) =>
			transport.call(RawRemoveSchema, (c) =>
				c.mutation(
					api.staffCatalog.removeException,
					{ key, ...input },
					{ skipQueue: true },
				),
			),
		requests: (input) =>
			transport.call(RawStaffRequestsSchema, (c) =>
				c.query(api.staffRequests.requests, { key, ...input }),
			),
	};
}
