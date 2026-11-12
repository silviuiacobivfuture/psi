import type { z } from "zod";
import { api } from "../convex/_generated/api";
import type { SchedulingConfig } from "./config";
import type { Mode } from "./domain/catalog";
import { canonicalCode, makeReference } from "./domain/tokens";
import {
	RawCalendarSchema,
	RawDecideSchema,
	RawExceptionSchema,
	RawRescheduleSchema,
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
}

export function createStaffSchedulingClient(config: SchedulingConfig): StaffSchedulingClient {
	return staffClientOn(createTransport(config));
}

export function staffClientOn(transport: Transport): StaffSchedulingClient {
	const key = transport.serverKey;
	const ref = (typed: string): string => canonicalCode(typed, 8) ?? "";
	return {
		calendar: (input) =>
			transport.call(RawCalendarSchema, (c) => c.query(api.staff.calendar, { key, ...input })),
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
						{ key, ...input, reference: ref(input.reference), newReference: makeReference() },
						{ skipQueue: true },
					),
				);
				if (raw.ok || raw.reason !== "retry") return raw;
			}
			return { ok: false, reason: "retry" };
		},
		addException: (input) =>
			transport.call(RawExceptionSchema, (c) =>
				c.mutation(api.staff.addException, { key, ...input }, { skipQueue: true }),
			),
	};
}
