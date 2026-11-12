import type { z } from "zod";
import { api } from "../convex/_generated/api";
import type { SchedulingConfig } from "./config";
import type { Audience, Mode } from "./domain/catalog";
import type { AppointmentStatus } from "./domain/conflicts";
import type { DecisionReason } from "./domain/lifecycle";
import { canonicalCode, makeReference } from "./domain/tokens";
import {
	RawAddRuleSchema,
	RawBoardSchema,
	RawCalendarSchema,
	RawChangedSchema,
	RawClosureSchema,
	RawCreatePractitionerSchema,
	RawCreateRoomSchema,
	RawCreateServiceSchema,
	RawDaysOffSchema,
	RawDecideSchema,
	RawExceptionSchema,
	RawPeriodSchema,
	RawRemovedSchema,
	RawRemoveSchema,
	RawRescheduleSchema,
	RawRoomsSchema,
	RawSetDayRulesSchema,
	RawStaffAvailabilitySchema,
	RawStaffCatalogSchema,
	RawStaffRequestsSchema,
	RawUpdatePractitionerSchema,
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
export type CreatePractitionerResult = z.infer<typeof RawCreatePractitionerSchema>;
export type UpdatePractitionerResult = z.infer<typeof RawUpdatePractitionerSchema>;
export type CreateServiceResult = z.infer<typeof RawCreateServiceSchema>;
export type SetDayRulesResult = z.infer<typeof RawSetDayRulesSchema>;
export type DaysOffResult = z.infer<typeof RawDaysOffSchema>;
export type CreateRoomResult = z.infer<typeof RawCreateRoomSchema>;
export type RoomsResult = z.infer<typeof RawRoomsSchema>;
export type ClosureResult = z.infer<typeof RawClosureSchema>;
export type PeriodResult = z.infer<typeof RawPeriodSchema>;
export type ChangedResult = z.infer<typeof RawChangedSchema>;
export type RemovedResult = z.infer<typeof RawRemovedSchema>;
export type BoardResult = z.infer<typeof RawBoardSchema>;

/** What a room is, as the team writes it. */
export interface NewRoom {
	/** Lowercase letters, digits and hyphens; its key for good. */
	slug: string;
	name: string;
	/** One of `ROOM_KINDS`. */
	kind: string;
	capacity: number;
	suits: Audience[];
	/** Short tags (`eeg`, `snoezelen`) a service may require. */
	equipment: string[];
}

/** The room an onsite session of a service needs. */
export interface RoomRequirement {
	roomKind: string;
	roomEquipment?: string[];
	roomAudiences?: Audience[];
}

/** One weekday of a period schedule. */
export interface PeriodDay {
	weekday: number;
	windows: DayWindow[];
}

/** A service's name in both languages. */
export interface ServiceName {
	ro: string;
	en: string;
}

/** What `createService` takes: every setting stated, the slug its key for good. */
export interface NewService {
	/** Lowercase letters, digits and hyphens (2 to 41 characters); never changes. */
	slug: string;
	name: ServiceName;
	durationMinutes: number;
	bufferMinutes: number;
	stepMinutes: number;
	minNoticeMinutes: number;
	horizonDays: number;
	holdMinutes: number;
	modes: Mode[];
	/** For onsite sessions: the address key the app renders. */
	location?: string;
	/** Practitioner ids of this tenant who offer it. */
	practitioners: string[];
}

/** One opening of a regular day: minutes after local midnight, and the modes it offers. */
export interface DayWindow {
	start: number;
	end: number;
	modes: Mode[];
}
/** One row of the tenant-wide list; it never carries the account hash. */
export type StaffRequest = z.infer<typeof StaffRequestSchema>;
export type StaffRequestsResult = z.infer<typeof RawStaffRequestsSchema>;

/** What `updateService` may change; anything left out stays as it is. */
export interface ServicePatch {
	name?: ServiceName;
	durationMinutes?: number;
	bufferMinutes?: number;
	stepMinutes?: number;
	minNoticeMinutes?: number;
	horizonDays?: number;
	holdMinutes?: number;
	modes?: Mode[];
	/** Practitioner ids of this tenant who offer it (replaces the list). */
	practitioners?: string[];
	/** The room kind an onsite session needs; null: none. */
	roomKind?: string | null;
	roomEquipment?: string[];
	roomAudiences?: Audience[];
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
	/** Adds a practitioner (and the tenant, on the very first create). The same slug and name again is a no-op. */
	createPractitioner(input: {
		tenant: string;
		slug: string;
		displayName: string;
		/** A contractor rather than an employee. */
		external?: boolean;
		actor: StaffActor;
	}): Promise<CreatePractitionerResult>;
	/** Renames or takes a practitioner offline; `upcoming` counts the requests and confirmed visits still ahead. */
	updatePractitioner(input: {
		tenant: string;
		practitioner: string;
		patch: {
			displayName?: string;
			active?: boolean;
			external?: boolean;
			/** Rooms this person may use; empty means any suitable room. */
			rooms?: string[];
		};
		actor: StaffActor;
	}): Promise<UpdatePractitionerResult>;
	/** Adds a service (and the tenant, on the very first create). The same slug and settings again is a no-op. */
	createService(input: {
		tenant: string;
		service: NewService & Partial<RoomRequirement>;
		actor: StaffActor;
	}): Promise<CreateServiceResult>;
	/**
	 * Replaces a practitioner's regular hours on these ISO weekdays with these windows (none
	 * closes the days); date-bound openings are untouched.
	 */
	setDayRules(input: {
		tenant: string;
		practitioner: string;
		weekdays: number[];
		windows: DayWindow[];
		/** Only alternating week A or B (needs `setAlternating` first); absent: every week. */
		week?: "A" | "B";
		actor: StaffActor;
	}): Promise<SetDayRulesResult>;
	/** Turns alternating weeks on (`anchor`: a Monday whose week is A) or off (null). */
	setAlternating(input: {
		tenant: string;
		practitioner: string;
		anchor: string | null;
		actor: StaffActor;
	}): Promise<ChangedResult>;
	/** Sets hours that replace the regular week from `from` to `until`; the same `from` again replaces it. */
	setPeriod(input: {
		tenant: string;
		practitioner: string;
		from: string;
		until?: string;
		days: PeriodDay[];
		week?: "A" | "B";
		actor: StaffActor;
	}): Promise<PeriodResult>;
	removePeriod(input: {
		tenant: string;
		practitioner: string;
		from: string;
		actor: StaffActor;
	}): Promise<RemovedResult>;
	createRoom(input: {
		tenant: string;
		room: NewRoom;
		actor: StaffActor;
	}): Promise<CreateRoomResult>;
	updateRoom(input: {
		tenant: string;
		room: string;
		patch: Partial<Omit<NewRoom, "slug">> & { active?: boolean };
		actor: StaffActor;
	}): Promise<ChangedResult>;
	/** Takes a room out of use for whole dates, or part of one date. */
	addRoomClosure(input: {
		tenant: string;
		room: string;
		from: string;
		to: string;
		start?: number;
		end?: number;
		actor: StaffActor;
	}): Promise<ClosureResult>;
	removeRoomClosure(input: {
		tenant: string;
		closure: string;
		actor: StaffActor;
	}): Promise<RemoveResult>;
	rooms(input: { tenant: string; fromDate: string }): Promise<RoomsResult>;
	/** The calendar for `days` (at most 14) from a local date. */
	board(input: { tenant: string; fromDate: string; days: number }): Promise<BoardResult>;
	/** Closes whole days, `from` to `to` inclusive (at most 62), for these practitioners; closed days stay as they are. */
	addDaysOff(input: {
		tenant: string;
		practitioners: string[];
		from: string;
		to: string;
		actor: StaffActor;
	}): Promise<DaysOffResult>;
	removeRule(input: { tenant: string; rule: string; actor: StaffActor }): Promise<RemoveResult>;
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
				c.mutation(api.staff.addException, { key, ...input }, { skipQueue: true }),
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
				c.mutation(api.staffCatalog.updateService, { key, ...input }, { skipQueue: true }),
			),
		addRule: (input) =>
			transport.call(RawAddRuleSchema, (c) =>
				c.mutation(api.staffCatalog.addRule, { key, ...input }, { skipQueue: true }),
			),
		createPractitioner: (input) =>
			transport.call(RawCreatePractitionerSchema, (c) =>
				c.mutation(api.staffSetup.createPractitioner, { key, ...input }, { skipQueue: true }),
			),
		updatePractitioner: (input) =>
			transport.call(RawUpdatePractitionerSchema, (c) =>
				c.mutation(api.staffSetup.updatePractitioner, { key, ...input }, { skipQueue: true }),
			),
		setAlternating: (input) =>
			transport.call(RawChangedSchema, (c) =>
				c.mutation(api.staffSchedule.setAlternating, { key, ...input }, { skipQueue: true }),
			),
		setPeriod: (input) =>
			transport.call(RawPeriodSchema, (c) =>
				c.mutation(api.staffSchedule.setPeriod, { key, ...input }, { skipQueue: true }),
			),
		removePeriod: (input) =>
			transport.call(RawRemovedSchema, (c) =>
				c.mutation(api.staffSchedule.removePeriod, { key, ...input }, { skipQueue: true }),
			),
		createRoom: ({ room, ...input }) =>
			transport.call(RawCreateRoomSchema, (c) =>
				c.mutation(api.staffRooms.createRoom, { key, ...input, ...room }, { skipQueue: true }),
			),
		updateRoom: (input) =>
			transport.call(RawChangedSchema, (c) =>
				c.mutation(api.staffRooms.updateRoom, { key, ...input }, { skipQueue: true }),
			),
		addRoomClosure: (input) =>
			transport.call(RawClosureSchema, (c) =>
				c.mutation(api.staffRooms.addRoomClosure, { key, ...input }, { skipQueue: true }),
			),
		removeRoomClosure: (input) =>
			transport.call(RawRemoveSchema, (c) =>
				c.mutation(api.staffRooms.removeRoomClosure, { key, ...input }, { skipQueue: true }),
			),
		rooms: (input) =>
			transport.call(RawRoomsSchema, (c) => c.query(api.staffRooms.rooms, { key, ...input })),
		board: (input) =>
			transport.call(RawBoardSchema, (c) => c.query(api.staffBoard.board, { key, ...input })),
		createService: ({ service, ...input }) =>
			transport.call(RawCreateServiceSchema, (c) =>
				c.mutation(
					api.staffSetup.createService,
					{ key, ...input, ...service },
					{ skipQueue: true },
				),
			),
		setDayRules: (input) =>
			transport.call(RawSetDayRulesSchema, (c) =>
				c.mutation(api.staffSetup.setDayRules, { key, ...input }, { skipQueue: true }),
			),
		addDaysOff: (input) =>
			transport.call(RawDaysOffSchema, (c) =>
				c.mutation(api.staffSetup.addDaysOff, { key, ...input }, { skipQueue: true }),
			),
		removeRule: (input) =>
			transport.call(RawRemoveSchema, (c) =>
				c.mutation(api.staffCatalog.removeRule, { key, ...input }, { skipQueue: true }),
			),
		removeException: (input) =>
			transport.call(RawRemoveSchema, (c) =>
				c.mutation(api.staffCatalog.removeException, { key, ...input }, { skipQueue: true }),
			),
		requests: (input) =>
			transport.call(RawStaffRequestsSchema, (c) =>
				c.query(api.staffRequests.requests, { key, ...input }),
			),
	};
}
