import { ENTRY_REASONS, PLAN_REASONS } from "@psi/scheduling/domain";
import type {
	AvailabilityPreview as AvailabilityPreviewSchema,
	AvailabilityRule as AvailabilityRuleSchema,
	Availability as AvailabilitySchema,
	BookingPause as BookingPauseSchema,
	BookingPauses as BookingPausesSchema,
	OneOffCreated as OneOffCreatedSchema,
	OneOffEntry as OneOffEntrySchema,
	PauseInput as PauseInputSchema,
	RoomClosureCreate as RoomClosureCreateSchema,
	RoomClosure as RoomClosureSchema,
	RulesCopied as RulesCopiedSchema,
} from "@psi/scheduling-sdk/contract";
import { z } from "zod/v4";
import { PortError } from "./port";
import type { AppSlug } from "./schema";

/** The shapes the availability editor reads and writes: the scheduling service's own contract, never a copy of it. */
export type Availability = z.output<typeof AvailabilitySchema>;
export type AvailabilityRule = z.output<typeof AvailabilityRuleSchema>;
export type OneOffEntry = z.output<typeof OneOffEntrySchema>;
export type OneOffCreated = z.output<typeof OneOffCreatedSchema>;
export type RulesCopied = z.output<typeof RulesCopiedSchema>;
export type AvailabilityPreview = z.output<typeof AvailabilityPreviewSchema>;
export type RoomClosure = z.output<typeof RoomClosureSchema>;
export type RoomClosureInput = z.output<typeof RoomClosureCreateSchema>;
export type BookingPause = z.output<typeof BookingPauseSchema>;
export type BookingPauses = z.output<typeof BookingPausesSchema>;
export type PauseInput = z.output<typeof PauseInputSchema>;

/** One problem of a refused weekly plan: the rule it is about (`index`), and for an overlap the rule it meets. */
export const PlanProblemRow = z.object({
	reason: z.enum(PLAN_REASONS),
	index: z.number().int().nonnegative().optional(),
	other: z.number().int().nonnegative().optional(),
	personId: z.string().optional(),
});
/** One problem of a refused one-off entry or room closure: the date it is about, and whose day it is. */
export const EntryProblemRow = z.object({
	reason: z.enum(ENTRY_REASONS),
	date: z.string().optional(),
	personId: z.string().optional(),
});
/** `detail` of a refused save: which kind of save, and every problem it had. */
export const SaveProblems = z.discriminatedUnion("reason", [
	z.object({ reason: z.literal("plan"), problems: z.array(PlanProblemRow) }),
	z.object({ reason: z.literal("entry"), problems: z.array(EntryProblemRow) }),
]);
export type SaveProblems = z.output<typeof SaveProblems>;
export type PlanProblemItem = z.output<typeof PlanProblemRow>;
export type EntryProblemItem = z.output<typeof EntryProblemRow>;

/** A save the service refused with its problems (nothing was written): the page shows each beside what it is about. */
export class SaveRefusal extends PortError {
	constructor(
		message: string,
		readonly detail: SaveProblems,
	) {
		super("invalid", message, [], detail.reason);
		this.name = "SaveRefusal";
	}
}

/** A practitioner whose hours can be set: a person with a calendar. */
export interface Practitioner {
	id: string;
	name: string;
}

/** A service as the public site books it: its slug (what a preview and a pause name), its length and its buffer. */
export interface BookableService {
	slug: string;
	name: string;
	durationMin: number;
	bufferMin: number;
}

/**
 * The practitioners' hours, their one-off days, the rooms' closed days and stopping online booking. A save that breaks a
 * rule refuses with `SaveRefusal` (every problem, nothing written); a pause the service will not keep refuses `invalid`
 * with its reason (`until_before_from`, `until_past`, `unknown_site`, `unknown_service`, `unknown_practitioner`,
 * `too_many`).
 */
export interface AvailabilityPort {
	/** The people with a calendar, by name. */
	practitioners(app: AppSlug): Promise<ReadonlyArray<Practitioner>>;
	/** The active services, with the slug the public site books them by. */
	bookableServices(app: AppSlug): Promise<ReadonlyArray<BookableService>>;
	/** A practitioner's weekly rules, and their one-off days from `from` on. */
	availability(app: AppSlug, personId: string, from: string): Promise<Availability>;
	/** Replaces the practitioner's weekly rules, all of them at once. */
	saveRules(
		app: AppSlug,
		personId: string,
		rules: ReadonlyArray<AvailabilityRule>,
	): Promise<Availability>;
	/** Gives the others this practitioner's weekly rules, replacing theirs: all of them, or none. */
	copyRules(app: AppSlug, from: string, to: ReadonlyArray<string>): Promise<RulesCopied>;
	/** Adds a one-off day or range to each of them: to all, or to none. */
	addOneOff(
		app: AppSlug,
		personIds: ReadonlyArray<string>,
		entry: OneOffEntry,
	): Promise<OneOffCreated>;
	removeOneOff(app: AppSlug, personId: string, entryId: string): Promise<void>;
	/** The free times the public site offers of the practitioner for the service between two instants. */
	availabilityPreview(
		app: AppSlug,
		personId: string,
		service: string,
		from: number,
		to: number,
	): Promise<AvailabilityPreview>;
	roomClosures(app: AppSlug, roomId: string, from: string): Promise<ReadonlyArray<RoomClosure>>;
	addRoomClosure(
		app: AppSlug,
		roomId: string,
		input: RoomClosureInput,
	): Promise<ReadonlyArray<RoomClosure>>;
	removeRoomClosure(app: AppSlug, roomId: string, closureId: string): Promise<void>;
	/** Every pause of online booking, the public sites, and whether one is in force: any member may read it. */
	bookingPauses(app: AppSlug): Promise<BookingPauses>;
	createPause(app: AppSlug, input: PauseInput): Promise<BookingPause>;
	updatePause(app: AppSlug, id: string, input: PauseInput): Promise<BookingPause>;
	/** Lifts it: online booking opens again for what it covered. */
	removePause(app: AppSlug, id: string): Promise<void>;
}
