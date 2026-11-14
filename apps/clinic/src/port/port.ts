import type {
	AssistantEffectiveType,
	AssistantOrgConfig,
	AssistantOrgDocumentType,
	AssistantPlatformConfig,
	AssistantPlatformDocumentType,
	AssistantStopName,
	AssistantUsageRecord,
	Capabilities as ScheduleCapabilities,
} from "@psi/scheduling-sdk/contract";
import type { FloorPlanDoc, SaveResult } from "@psi/ui/admin/floor-plan";
import type { z } from "zod/v4";
import type { Conflict, Probe } from "../domain/conflicts";
import type { ProfilePort } from "./profile-port";
import type { Report, ReportQuery } from "./report-schema";
import type {
	Appointment,
	AppointmentPatch,
	AppSlug,
	AssistantMode,
	AuditEvent,
	Client,
	Column,
	Membership,
	NewAppointment,
	NewClient,
	NewPackage,
	NewPayment,
	Package,
	PackagePatch,
	PaymentMethod,
	PushPrefs,
	Role,
	RosterEntry,
	SearchHit,
	Service,
	WebRequest,
} from "./schema";
import type {
	CatalogKind,
	DeviceInput,
	NewRole,
	PersonInput,
	RoomInput,
	ServiceInput,
} from "./schema-catalog";
import type {
	Actor,
	BlacklistEntry,
	ClientFile,
	ClientFlag,
	ClientNote,
	ClientPatch,
	ClientRecord,
	ClientSummary,
	FormDefinition,
	NewBlacklist,
	NewFile,
	NewNote,
	NewRecord,
	NotePatch,
	RecordPatch,
} from "./schema-clinical";
import type { MemberDetail, MemberInput, OverridesInput } from "./schema-members";

export type ClientFilter = "current" | "archived";

export interface CalendarData {
	columns: ReadonlyArray<Column>;
	appointments: ReadonlyArray<Appointment>;
	clients: ReadonlyArray<Client>;
	services: ReadonlyArray<Service>;
	/** What to flag on a client's tiles, by client id (the console fills it in for the days it shows). */
	flags?: Readonly<Record<string, ClientFlag>>;
}

export interface ReminderItem {
	appointment: Appointment;
	client: Client;
	column: Column;
	sent: boolean;
}

/**
 * What the signed-in person may do in one app, as the scheduling service says it (`GET /v1/apps/:app/me`): a hint for
 * what to offer, never the authority — the service authorizes every call again.
 */
export type Capabilities = z.output<typeof ScheduleCapabilities>;

/** Who the console is looking at the app as (read-only), when a roles administrator has chosen "Vezi ca…". */
export type ViewAsTarget = `role:${string}` | `member:${string}`;

export interface TeamMember {
	subject: string;
	displayName: string;
	roles: ReadonlyArray<string>;
	email?: string;
}

/** Something changed in the app: the screen that shows it asks again. Carries no data, only what to refresh. */
export interface LiveSignal {
	stream: "calendar" | "requests" | "inbox";
	/** The inbox badge: open requests (and reminders, when the person may see them). Absent on the other streams. */
	counts?: { requests: number; reminders?: number };
}

/**
 * The refusal the port gives; a screen turns it into its error state, never a blank page.
 * `forbidden`: the service says this person may not. `conflict`: someone else got there first (slot taken, already
 * exists). `rate-limited`: too many calls; try again shortly. `unauthenticated`: the sign-in no longer holds; sign in
 * again. `not-available-yet`: the service answers 501 — the screen shows "în curând".
 */
export type PortErrorCode =
	| "unavailable"
	| "not-found"
	| "invalid"
	| "forbidden"
	| "conflict"
	| "rate-limited"
	| "unauthenticated"
	| "not-available-yet";

export class PortError extends Error {
	constructor(
		readonly code: PortErrorCode,
		message: string,
		/** For `conflict`: what the asked time collides with. */
		readonly conflicts: ReadonlyArray<Conflict> = [],
	) {
		super(message);
		this.name = "PortError";
	}
}

/**
 * Everything the console reads and writes. The scheduling service's SDK implements it; until then
 * the in-memory fake does. Every call is scoped to one app: nothing crosses apps.
 */
export interface ClinicPort extends ProfilePort {
	memberships(subject: string): Promise<ReadonlyArray<Membership>>;
	/** The person is the estate administrator: the platform zone is theirs, and every app, member of it or not. */
	platformAdmin(subject: string): Promise<boolean>;
	calendar(app: AppSlug, from: string, to: string): Promise<CalendarData>;
	appointment(app: AppSlug, id: string): Promise<Appointment | null>;
	/**
	 * Creates the appointment, or its whole weekly series, in one step. Refuses with `conflict`
	 * (listing what collides, nothing written) when any occurrence would double-book a column,
	 * room or device; with `invalid` for an unknown service, column, resource, client or package.
	 */
	createAppointments(app: AppSlug, input: NewAppointment): Promise<ReadonlyArray<Appointment>>;
	/** Moves, resizes, re-assigns or re-statuses one appointment; the same conflict rule applies. */
	updateAppointment(app: AppSlug, id: string, patch: AppointmentPatch): Promise<Appointment>;
	/**
	 * Changes this appointment and the ones after it (`following`), or every one still to come (`all`), of its weekly
	 * series, all or nothing: a week that is taken refuses the whole change with `conflict` and nothing moves. The
	 * date and the status are never changed this way. `invalid` when the appointment is in no series.
	 */
	updateSeries(
		app: AppSlug,
		id: string,
		patch: AppointmentPatch,
		scope: "following" | "all",
	): Promise<ReadonlyArray<Appointment>>;
	/** Cancels this appointment and the ones after it, or every one still to come, with the reason, all or nothing. */
	cancelSeries(
		app: AppSlug,
		id: string,
		reason: string,
		scope: "following" | "all",
	): Promise<ReadonlyArray<Appointment>>;
	/** Cancels with a reason; the time becomes free. */
	cancelAppointment(app: AppSlug, id: string, reason: string): Promise<Appointment>;
	/** Records that the session was paid, and how. */
	collectPayment(app: AppSlug, id: string, method: PaymentMethod): Promise<Appointment>;
	/** What a time on a day collides with: the same rule the writes enforce, for showing it before saving. */
	findConflicts(app: AppSlug, probe: Probe): Promise<ReadonlyArray<Conflict>>;
	createClient(app: AppSlug, input: NewClient): Promise<Client>;
	/** Records who did what (the staff assistant's actions land in the audit log). */
	appendAudit(
		app: AppSlug,
		entry: { actor: string; action: string; target: string },
	): Promise<void>;
	search(app: AppSlug, query: string): Promise<ReadonlyArray<SearchHit>>;
	clients(app: AppSlug, filter: ClientFilter, query: string): Promise<ReadonlyArray<Client>>;
	client(app: AppSlug, id: string): Promise<Client | null>;
	clientAppointments(app: AppSlug, id: string): Promise<ReadonlyArray<Appointment>>;
	archiveClient(app: AppSlug, id: string): Promise<void>;
	deleteClient(app: AppSlug, id: string): Promise<void>;
	packages(app: AppSlug, clientId: string): Promise<ReadonlyArray<Package>>;
	createPackage(app: AppSlug, clientId: string, input: NewPackage): Promise<Package>;
	/** Refuses (`invalid`) sessions + bonus below the sessions already used. */
	updatePackage(
		app: AppSlug,
		clientId: string,
		packageId: string,
		patch: PackagePatch,
	): Promise<Package>;
	/** Appends a payment (never edits one); `recordedBy` is the person's name from the token. */
	addPayment(
		app: AppSlug,
		clientId: string,
		packageId: string,
		input: NewPayment,
		recordedBy: string,
	): Promise<Package>;
	roster(
		app: AppSlug,
		weekStart: string,
	): Promise<{
		people: ReadonlyArray<Column>;
		entries: ReadonlyArray<RosterEntry>;
	}>;
	requests(app: AppSlug): Promise<ReadonlyArray<WebRequest>>;
	markRequestHandled(app: AppSlug, id: string): Promise<void>;
	reminders(app: AppSlug, date: string): Promise<ReadonlyArray<ReminderItem>>;
	markReminderSent(app: AppSlug, appointmentId: string): Promise<void>;
	columns(app: AppSlug): Promise<ReadonlyArray<Column>>;
	/** Every person, room and device the team set up, the inactive ones too (the calendar's `columns` has only the active). */
	catalogColumns(app: AppSlug): Promise<ReadonlyArray<Column>>;
	/** Adds (`id` null) or changes a team member; a practitioner gets a calendar column. Refuses (`invalid`) a bad value, (`conflict`) an e-mail already on the team. */
	savePerson(app: AppSlug, id: string | null, input: PersonInput): Promise<Column>;
	saveRoom(app: AppSlug, id: string | null, input: RoomInput): Promise<Column>;
	saveDevice(app: AppSlug, id: string | null, input: DeviceInput): Promise<Column>;
	saveService(app: AppSlug, id: string | null, input: ServiceInput): Promise<Service>;
	/** Removes it, or switches it off when it has history (appointments): `deactivated`. Never loses a booking. */
	removeCatalog(
		app: AppSlug,
		kind: CatalogKind,
		id: string,
	): Promise<{ outcome: "deleted" | "deactivated" }>;
	createRole(app: AppSlug, input: NewRole): Promise<Role>;
	/** Refuses (`conflict`) a role still held by someone, and a system role. */
	deleteRole(app: AppSlug, id: string): Promise<void>;
	services(app: AppSlug): Promise<ReadonlyArray<Service>>;
	roles(app: AppSlug): Promise<ReadonlyArray<Role>>;
	saveRole(app: AppSlug, role: Role): Promise<Role>;
	audit(app: AppSlug): Promise<ReadonlyArray<AuditEvent>>;
	/**
	 * The statistics of a period (and of the one to compare with, when asked), for the whole clinic or one person's
	 * column. A service answers each figure only as far as this person's permissions reach (money needs the money group).
	 * Mapped onto the service's reports routes; a figure it cannot give for the slice asked is `null`.
	 */
	report(app: AppSlug, query: ReportQuery): Promise<Report>;
	/** The person's own capabilities in the app, or — with `as` — those a role or member would hold (roles administrators). */
	capabilities(subject: string, app: AppSlug, as?: ViewAsTarget): Promise<Capabilities>;
	/** The app's team, for the "Vezi ca…" picker and the members' list. */
	members(app: AppSlug): Promise<ReadonlyArray<TeamMember>>;
	/** One member for their editor: roles, grants, denials, linked calendars, what they may do in the end. */
	member(app: AppSlug, subject: string): Promise<MemberDetail | null>;
	/**
	 * Adds the sign-in account to the team or changes their name, roles and coordinated calendars (the whole set: a role
	 * left out is taken away). Refuses (`forbidden`) one's own membership, (`invalid`) an unknown role or person.
	 */
	saveMember(app: AppSlug, subject: string, input: MemberInput): Promise<TeamMember>;
	/** Replaces the member's individual grants and denials; a denial wins over every role and grant. */
	saveMemberOverrides(
		app: AppSlug,
		subject: string,
		input: OverridesInput,
	): Promise<{ grant: ReadonlyArray<string>; deny: ReadonlyArray<string> }>;
	/** Takes the person out of the team: their roles, grants and denials go with them. */
	removeMember(app: AppSlug, subject: string): Promise<void>;
	/** Binds a calendar column (a person) to the member's sign-in: their `own` reach is that calendar. */
	linkCalendar(app: AppSlug, subject: string, personId: string): Promise<void>;
	/** Starts / ends looking at the app as someone else: audited events of the administrator. */
	startViewAs(subject: string, app: AppSlug, as: ViewAsTarget): Promise<Capabilities>;
	stopViewAs(subject: string, app: AppSlug): Promise<void>;
	/**
	 * The service's live streams for the app, merged: yields a signal whenever the calendar, the requests or the inbox
	 * badge change. Reconnects with backoff by itself; ends only when `signal` aborts.
	 */
	live(app: AppSlug, signal: AbortSignal): AsyncIterable<LiveSignal>;
	/**
	 * The clinic's floor plan, and whether this port can keep a drawn one. A service that stores none answers an empty
	 * plan with `writable: false`: the live view still works, drawing says "în curând".
	 */
	floorPlan(app: AppSlug): Promise<{ doc: FloorPlanDoc; writable: boolean }>;
	/** Saves a plan edited from `doc.revision`; `stale` when the stored one moved on, `not-available-yet` when it cannot be kept. */
	saveFloorPlan(app: AppSlug, doc: FloorPlanDoc): Promise<SaveResult>;
	/** Edits the client's own details; only what is present changes. */
	updateClient(app: AppSlug, id: string, patch: ClientPatch): Promise<Client>;
	/** The client list's rich rows in ONE read: next appointment, balance, blacklist, pinned notes. */
	clientSummaries(
		app: AppSlug,
		filter: ClientFilter,
		query: string,
	): Promise<ReadonlyArray<ClientSummary>>;
	/** What to flag on the calendar and the editor for these clients (blacklist, newest pinned note), by client id. */
	clientFlags(
		app: AppSlug,
		clientIds: ReadonlyArray<string>,
	): Promise<Readonly<Record<string, ClientFlag>>>;
	/** Newest first; pinned ones are flagged, not moved. */
	notes(app: AppSlug, clientId: string): Promise<ReadonlyArray<ClientNote>>;
	addNote(app: AppSlug, clientId: string, input: NewNote, by: Actor): Promise<ClientNote>;
	/** Changes the text or category (stamps "editat"), or pins / unpins. */
	updateNote(app: AppSlug, noteId: string, patch: NotePatch): Promise<ClientNote>;
	deleteNote(app: AppSlug, noteId: string): Promise<void>;
	/** Every entry the client ever had, newest first: the blacklist's history. */
	blacklistHistory(app: AppSlug, clientId: string): Promise<ReadonlyArray<BlacklistEntry>>;
	addBlacklist(
		app: AppSlug,
		clientId: string,
		input: NewBlacklist,
		by: Actor,
	): Promise<BlacklistEntry>;
	/** Ends an entry by hand; it stays in the history with who ended it and why. */
	endBlacklist(app: AppSlug, entryId: string, reason: string, by: Actor): Promise<BlacklistEntry>;
	/** The form definitions a record may be started from (the seeded templates and the owners' own). */
	formTemplates(app: AppSlug): Promise<ReadonlyArray<FormDefinition>>;
	records(app: AppSlug, clientId: string): Promise<ReadonlyArray<ClientRecord>>;
	record(app: AppSlug, id: string): Promise<ClientRecord | null>;
	/** Refuses (`invalid`) a form that is unknown, or a finalised record whose values do not satisfy its form. */
	createRecord(app: AppSlug, clientId: string, input: NewRecord, by: Actor): Promise<ClientRecord>;
	/** A finalised record is changed only back through a patch that keeps it valid. */
	updateRecord(app: AppSlug, id: string, patch: RecordPatch): Promise<ClientRecord>;
	deleteRecord(app: AppSlug, id: string): Promise<void>;
	files(app: AppSlug, clientId: string): Promise<ReadonlyArray<ClientFile>>;
	/** Refuses (`invalid`) an empty or too big file or one of a type the clinic does not keep. */
	uploadFile(app: AppSlug, clientId: string, file: NewFile, by: Actor): Promise<ClientFile>;
	downloadFile(
		app: AppSlug,
		id: string,
	): Promise<{ name: string; contentType: string; bytes: Uint8Array }>;
	renameFile(app: AppSlug, id: string, name: string): Promise<ClientFile>;
	deleteFile(app: AppSlug, id: string): Promise<void>;
	pushPrefs(subject: string): Promise<PushPrefs>;
	savePushPrefs(subject: string, prefs: PushPrefs): Promise<void>;
	/** How this person's assistant shows (`null`: they never chose). Refuses `not-available-yet` while the service keeps none. */
	assistantMode(subject: string): Promise<AssistantMode | null>;
	saveAssistantMode(subject: string, mode: AssistantMode): Promise<void>;
	/** What governs this person's next assistant turn (the merged tiers for their roles and themselves, and their meters). */
	assistantEffective(app: AppSlug): Promise<AssistantEffectiveType>;
	/** Adds one of this person's turns to the meters; answers a limit that now stops the next one. */
	recordAssistantUsage(
		app: AppSlug,
		usage: AssistantUsageRecordType,
	): Promise<AssistantStopName | undefined>;
	/** The organisation's assistant tier, its ceilings, what applies now and the meters (Owner and Admin). */
	assistantConfig(app: AppSlug): Promise<AssistantOrgConfigType>;
	/** Saves the organisation's tier edited from `doc.revision`: `stale` when it moved on; a value past a ceiling is `invalid`. */
	saveAssistantConfig(app: AppSlug, doc: AssistantOrgDocumentType): Promise<AssistantOrgConfigType>;
	/** The estate's assistant tier (the platform administrator's). */
	assistantPlatform(): Promise<AssistantPlatformConfigType>;
	saveAssistantPlatform(doc: AssistantPlatformDocumentType): Promise<AssistantPlatformConfigType>;
	/**
	 * Any route of the scheduling service by its id, as this person (their token; the read-only header while viewing as
	 * someone else): the assistant's way to every function of the contract. `not-available-yet` without the service.
	 */
	callRoute(routeId: string, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export type AssistantUsageRecordType = z.input<typeof AssistantUsageRecord>;
export type AssistantOrgConfigType = z.output<typeof AssistantOrgConfig>;
export type AssistantPlatformConfigType = z.output<typeof AssistantPlatformConfig>;

/**
 * The port acting for one request's person. The scheduling service authorizes with the person's own token, so a port
 * is built per request; the in-memory fake ignores who asks.
 */
export interface PortSource {
	/** `viewAs` makes every call carry the read-only header the service refuses writes on. */
	forPerson(c: import("hono").Context, viewAs?: ViewAsTarget): Promise<ClinicPort>;
}
