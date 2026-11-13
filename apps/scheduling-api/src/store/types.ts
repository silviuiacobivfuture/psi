import type {
	App,
	Appointment,
	AuditEvent,
	CalendarEvent,
	Client,
	ClientNote,
	Definition,
	Device,
	FileMeta,
	Group,
	ImportRun,
	Leave,
	Member,
	Package,
	Payment,
	Person,
	RecordSummary,
	ReminderState,
	Role,
	Room,
	RosterDay,
	Service,
	WebRequest,
} from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import type { BlacklistPort, DocumentsPort, FeedbackPort, ReportsPort, SeriesPort } from "./ports";

type Out<T extends z.ZodType> = z.output<T>;
type InApp<T> = T & { app: string };

/** What the store keeps. Wire types plus the app, with the sealed forms of anything clinical. */
export type AppRow = InApp<Out<typeof App>>;
export type MemberRow = InApp<
	Omit<Out<typeof Member>, "subject"> & {
		id: string;
		subject: string;
		grants: string[];
		denies: string[];
	}
>;
export type RoleRow = InApp<Out<typeof Role>>;
export type PersonRow = InApp<Out<typeof Person>>;
export type RoomRow = InApp<Out<typeof Room>>;
export type DeviceRow = InApp<Out<typeof Device>>;
export type GroupRow = InApp<Out<typeof Group>>;
export type ServiceRow = InApp<Out<typeof Service>>;
/** `clinicalSealed` is the per-field AES-GCM envelope of the client's clinical group; the plain text is never stored. */
export type ClientRow = InApp<Omit<Out<typeof Client>, "clinical"> & { clinicalSealed?: string }>;
export type AppointmentRow = InApp<Out<typeof Appointment>>;
export type PackageRow = InApp<
	Pick<
		Out<typeof Package>,
		| "id"
		| "clientId"
		| "name"
		| "sessions"
		| "bonus"
		| "priceCents"
		| "discountCents"
		| "createdAt"
		| "updatedAt"
	> & { note?: string }
>;
/** `recordedBy` is the subject who took the money; the name is looked up when the row is shown, never stored. */
export type PaymentRow = InApp<Omit<Out<typeof Payment>, "recordedByName">>;
export type RosterRow = InApp<Out<typeof RosterDay>>;
export type LeaveRow = InApp<Out<typeof Leave>>;
export type ReminderRow = InApp<{
	id: string;
	state: Out<typeof ReminderState>;
	updatedAt: number;
}>;
export type RecordRow = InApp<Out<typeof RecordSummary> & { sealed: string }>;
export type FileRow = InApp<Out<typeof FileMeta> & { objectKey: string }>;
/**
 * A note about a client. A `clinic` note holds `sealed`, the per-field AES-GCM envelope of its text (bound to the
 * client), and no `text`; every other category holds `text` and no `sealed`.
 */
export type NoteRow = InApp<
	Omit<Out<typeof ClientNote>, "text"> & { text?: string; sealed?: string }
>;
export type AuditRow = InApp<Out<typeof AuditEvent>>;
export type DefinitionRow = InApp<Out<typeof Definition>>;
export type ImportRow = InApp<Out<typeof ImportRun>>;

export interface Rows {
	apps: AppRow;
	members: MemberRow;
	roles: RoleRow;
	people: PersonRow;
	rooms: RoomRow;
	devices: DeviceRow;
	groups: GroupRow;
	services: ServiceRow;
	clients: ClientRow;
	appointments: AppointmentRow;
	packages: PackageRow;
	payments: PaymentRow;
	roster: RosterRow;
	leave: LeaveRow;
	reminders: ReminderRow;
	records: RecordRow;
	files: FileRow;
	notes: NoteRow;
	audit: AuditRow;
	definitions: DefinitionRow;
	imports: ImportRow;
}
export type CollectionName = keyof Rows;
export const COLLECTIONS: readonly CollectionName[] = [
	"apps",
	"members",
	"roles",
	"people",
	"rooms",
	"devices",
	"groups",
	"services",
	"clients",
	"appointments",
	"packages",
	"payments",
	"roster",
	"leave",
	"reminders",
	"records",
	"files",
	"notes",
	"audit",
	"definitions",
	"imports",
];

export interface Query<R> {
	/** Equality on fields. */
	eq?: Partial<R>;
	/** A half-open range `[gte, lt)` on a numeric field. */
	range?: { field: keyof R & string; gte?: number; lt?: number };
}

export class StoreConflict extends Error {
	override readonly name = "StoreConflict";
}
/**
 * The store refused a change with a reason of its own (a wrapper's `{ok:false, reason}`): `not_found`, `stale`,
 * `overlaps`, `in_use`, `unknown_client`, `invalid`... The service maps it to the contract's refusal codes.
 */
export class StoreRefused extends Error {
	override readonly name = "StoreRefused";
	readonly reason: string;
	/** What the refusal says beyond its reason (field names, the entry that stopped a booking): never a person's data. */
	readonly detail: Readonly<Record<string, unknown>> | undefined;
	constructor(reason: string, detail?: Readonly<Record<string, unknown>>) {
		super(`store refused: ${reason}`);
		this.reason = reason;
		this.detail = detail;
	}
}
/** The store could not be reached or answered something it should not (the service answers 503). */
export class StoreUnavailable extends Error {
	override readonly name = "StoreUnavailable";
}
export interface Collection<R extends { id: string; app: string }> {
	get(app: string, id: string): Promise<R | undefined>;
	list(app: string, query?: Query<R>): Promise<R[]>;
	/** Throws StoreConflict when the id exists. */
	insert(row: R): Promise<R>;
	/** Replaces an existing row; false when there is none. */
	replace(row: R): Promise<boolean>;
	remove(app: string, id: string): Promise<boolean>;
}

type CalendarEventOut = z.output<typeof CalendarEvent>;
/**
 * Change events live in the store, so every replica streams the same sequence. `subscribe` is PUSH: the store tells
 * the service when something changed (in Convex, a live query over WebSocket); the service never polls.
 */
export interface ChangeFeed {
	append(app: string, event: Pick<CalendarEventOut, "kind" | "op" | "id">): Promise<void>;
	/** Events after `seq`, for a client that resumes. */
	since(app: string, seq: number): Promise<CalendarEventOut[]>;
	head(app: string): Promise<number>;
	/** Calls `onEvents` with each batch of NEW events after `after`; `onError` once if the subscription dies. Returns the unsubscribe. */
	subscribe(
		app: string,
		after: number,
		onEvents: (events: CalendarEventOut[]) => void,
		onError: (error: Error) => void,
	): Promise<() => void>;
}

export type Reason =
	| "invalid"
	| "unknown_service"
	| "slot_taken"
	| "not_offered"
	| "not_found"
	| "hold_expired"
	| "unavailable_online"
	| "not_allowed";
export type Failed = { ok: false; reason: Reason };

export interface OfferedSlot {
	id: string;
	practitioner: string;
	practitionerName: string;
	start: number;
	end: number;
	modes: ("onsite" | "online")[];
}
export interface HoldInput {
	service: string;
	practitioner: string;
	start: number;
	mode: "onsite" | "online";
	locale: "ro" | "en";
	channel: "form" | "guide";
}
export interface ContactInput {
	name: string;
	email?: string | undefined;
	phone?: string | undefined;
}

/** The visitor flow: services, slots, holds, requests. In Convex this is the existing visitor client. */
export interface VisitorPort {
	services(app: string): Promise<
		| {
				timeZone: string;
				services: {
					slug: string;
					name?: { ro: string; en: string };
					durationMinutes: number;
					modes: ("onsite" | "online")[];
					practitioners: { id: string; name: string }[];
				}[];
		  }
		| undefined
	>;
	slots(
		app: string,
		q: {
			service: string;
			from: number;
			to: number;
			mode?: "onsite" | "online" | undefined;
			limit?: number | undefined;
		},
	): Promise<
		| {
				ok: true;
				timeZone: string;
				service: { slug: string; durationMinutes: number; holdMinutes: number };
				slots: OfferedSlot[];
		  }
		| Failed
	>;
	hold(
		app: string,
		input: HoldInput,
	): Promise<
		| {
				ok: true;
				reference: string;
				holdToken: string;
				start: number;
				end: number;
				mode: "onsite" | "online";
				expiresAt: number;
				practitionerName: string;
				timeZone: string;
		  }
		| Failed
	>;
	release(app: string, reference: string, holdToken: string): Promise<{ ok: true } | Failed>;
	submit(
		app: string,
		input: {
			reference: string;
			holdToken: string;
			contact: ContactInput;
			audience?: "child" | "teen" | "adult" | undefined;
			subject?: string | undefined;
		},
	): Promise<
		| {
				ok: true;
				reference: string;
				cancelCode: string;
				start: number;
				end: number;
				mode: "onsite" | "online";
				timeZone: string;
		  }
		| Failed
	>;
	cancel(
		app: string,
		reference: string,
		cancelCode: string,
	): Promise<{ ok: true; start: number } | Failed>;
	callback(
		app: string,
		input: {
			contact: ContactInput;
			audience?: "child" | "teen" | "adult" | undefined;
			locale: "ro" | "en";
			when: "morning" | "afternoon" | "any";
			page: string;
			channel: "form" | "guide";
		},
	): Promise<{ reference: string }>;
	mine(
		app: string,
		subject: string,
	): Promise<
		{
			id: string;
			reference: string;
			status: string;
			start: number;
			end: number;
			mode?: "onsite" | "online";
			serviceSlug?: string;
		}[]
	>;
	cancelMine(app: string, subject: string, id: string): Promise<{ ok: true } | Failed>;
}

export interface RequestsPort {
	list(app: string, from: number, to: number): Promise<Out<typeof WebRequest>[]>;
	/** Requests waiting for the team (requested, or a callback). */
	pending(app: string): Promise<number>;
	decide(
		app: string,
		reference: string,
		decision: "confirm" | "decline" | "cancel" | "handle",
		reason: string | undefined,
		actor: string,
	): Promise<{ ok: true } | Failed>;
}

export interface StorePort {
	c: { [K in CollectionName]: Collection<Rows[K]> };
	changes: ChangeFeed;
	/** The apps a person is a member of, with their role ids. */
	appsOf(subject: string): Promise<{ app: string; roles: string[] }[]>;
	visitor: VisitorPort;
	requests: RequestsPort;
	/** Documents with a revision (the floor plan). */
	docs: DocumentsPort;
	/** Who may not book. */
	blacklist: BlacklistPort;
	/** What clients say, and the staff's answers. */
	feedback: FeedbackPort;
	/** Weekly series of appointments, changed all or nothing. */
	series: SeriesPort;
	/** The reports: read-only counts and rates over the app's rows. */
	reports: ReportsPort;
	/** Throws when the store cannot be reached (the readiness probe). */
	ping(): Promise<void>;
}
