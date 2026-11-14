import type {
	Capabilities as ScheduleCapabilities,
	RoleSummary as ScheduleRoleSummary,
} from "@psi/scheduling-sdk/contract";
import type { FloorPlanDoc, SaveResult } from "@psi/ui/admin/floor-plan";
import type { z } from "zod/v4";
import type { Conflict, Probe } from "../domain/conflicts";
import type { AvailabilityPort } from "./availability-port";
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
	Invite,
	InvitePick,
	InvitePreview,
	Membership,
	NewAppointment,
	NewClient,
	NewPackage,
	NewPayment,
	Package,
	PackagePatch,
	PaymentMethod,
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
import type { AccountLink } from "./schema-links";
import type {
	InviteInput,
	InviteOutcome,
	MemberDetail,
	MemberInput,
	OverridesInput,
	SignInLink,
	StaffMatch,
} from "./schema-members";
import type {
	MyNotifications,
	MyNotificationsView,
	MySettings,
	MySettingsView,
} from "./schema-settings";

export type ClientFilter = "current" | "archived";

export interface CalendarData {
	columns: ReadonlyArray<Column>;
	appointments: ReadonlyArray<Appointment>;
	clients: ReadonlyArray<Client>;
	services: ReadonlyArray<Service>;
	/** What to flag on a client's tiles, by client id (the console fills it in for the days it shows). */
	flags?: Readonly<Record<string, ClientFlag>>;
}

/**
 * Which one column's visits a calendar read answers: `column` when it is one of the caller's calendars that fits (in
 * `among` and shown by `show`, each when given), else the first of them that fits; none fits: no visits.
 */
export interface CalendarFocus {
	column: string | null;
	among?: ReadonlySet<string>;
	show?: (column: Column) => boolean;
}

/** One day of the month grid: its visits, counted. */
export interface DayCount {
	date: string;
	count: number;
}

export interface AuditPage {
	events: ReadonlyArray<AuditEvent>;
	nextCursor: string | null;
}

/** How many rows one page of a list shows (requests, the blacklist, reminders, a client's notes…). */
export const LIST_PAGE = 50;

/** One page of a list; `nextCursor` null: the last page. */
export interface Paged<T> {
	items: ReadonlyArray<T>;
	nextCursor: string | null;
}

/** A client on the blacklist: the active entry and who it is about. */
export interface ListedClient {
	entry: BlacklistEntry;
	clientId: string;
	clientName: string;
}

/** How many clients one page of the list shows. */
export const CLIENT_PAGE_SIZE = 50;

export interface ClientPage {
	clients: ReadonlyArray<Client>;
	summaries: ReadonlyArray<ClientSummary>;
	nextCursor: string | null;
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

/** Every role of the app with its stored permission keys, and the platform administrator's: what any member may compare. */
export type RoleSummary = z.output<typeof ScheduleRoleSummary>;

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
		/** The service's own reason inside a code (`no_email`, `already_active`): a screen words each, never the message. */
		readonly reason?: string,
	) {
		super(message);
		this.name = "PortError";
	}
}

/**
 * Everything the console reads and writes. The scheduling service's SDK implements it; until then
 * the in-memory fake does. Every call is scoped to one app: nothing crosses apps.
 */
export interface ClinicPort extends ProfilePort, AvailabilityPort {
	memberships(subject: string): Promise<ReadonlyArray<Membership>>;
	/**
	 * The calendar of the days `from`..`to`: every column, and their visits — or, with `focus`, only the visits of the
	 * one column it picks (the week draws one calendar: the others' visits are never read, only their names).
	 */
	calendar(app: AppSlug, from: string, to: string, focus?: CalendarFocus): Promise<CalendarData>;
	/** How many visits each day of `from`..`to` holds on the calendars this person may see (the month grid); empty days absent. */
	calendarSummary(app: AppSlug, from: string, to: string): Promise<ReadonlyArray<DayCount>>;
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
	/** These clients, whatever their standing (the ones not found or not visible are absent), in batched reads. */
	clientsByIds(app: AppSlug, ids: ReadonlyArray<string>): Promise<ReadonlyArray<Client>>;
	clientAppointments(app: AppSlug, id: string): Promise<ReadonlyArray<Appointment>>;
	archiveClient(app: AppSlug, id: string): Promise<void>;
	deleteClient(app: AppSlug, id: string): Promise<void>;
	/** The client's online-account invitation, or `null` when they were never invited. */
	invite(app: AppSlug, clientId: string): Promise<Invite | null>;
	/** The e-mail as it would go; sends and writes nothing. */
	previewInvite(app: AppSlug, clientId: string, pick: InvitePick): Promise<InvitePreview>;
	/**
	 * Turns the client into a registered user: creates (or finds) their sign-in account, links it, e-mails the invitation.
	 * Refuses with `conflict` (reason `already_invited`, `already_active`, `account_disabled`, `client_not_active`),
	 * `invalid` (`no_email`), `forbidden`, or `unavailable` (the sign-in is away); nothing is written then.
	 */
	sendInvite(app: AppSlug, clientId: string, pick: InvitePick): Promise<Invite>;
	/** A fresh link (the earlier one stops working); refused within a minute of the last send (`too_soon`). */
	resendInvite(app: AppSlug, clientId: string): Promise<Invite>;
	/** Withdraws it: the link stops working and the client is unlinked; the sign-in account itself is never touched. */
	revokeInvite(app: AppSlug, clientId: string): Promise<Invite>;
	/** Online accounts whose booking matched clients without certainty: the candidates this person may invite. */
	accountLinks(app: AppSlug): Promise<ReadonlyArray<AccountLink>>;
	/** Links the account to one candidate; `not-found` for no such pair, `conflict` when another account has the client. */
	confirmAccountLink(app: AppSlug, id: string, clientId: string): Promise<void>;
	/** The account is none of them: the suggestion goes and is not made again. */
	dismissAccountLink(app: AppSlug, id: string): Promise<void>;
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
	/** ONE page (LIST_PAGE) of the open or the handled requests, newest first, after `cursor` (null: the first). */
	requestPage(
		app: AppSlug,
		show: "open" | "handled",
		cursor: string | null,
	): Promise<Paged<WebRequest>>;
	/** ONE page (LIST_PAGE) of the clients on the blacklist now, newest entry first, each with the client's name. */
	blacklistPage(app: AppSlug, cursor: string | null): Promise<Paged<ListedClient>>;
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
	/** The roles to compare (names and keys only): readable by every member, unlike `roles` (roles_view). */
	roleSummary(app: AppSlug): Promise<RoleSummary>;
	saveRole(app: AppSlug, role: Role): Promise<Role>;
	audit(app: AppSlug): Promise<ReadonlyArray<AuditEvent>>;
	/**
	 * ONE page of the journal, newest first, of the days `from`..`to` (both included, either open), after `cursor` (null:
	 * the newest), at most `limit` events. `nextCursor` null: nothing older.
	 */
	auditPage(
		app: AppSlug,
		window: { from?: string; to?: string },
		cursor: string | null,
		limit: number,
	): Promise<AuditPage>;
	/**
	 * The statistics of a period (and of the one to compare with, when asked), for the whole clinic or one person's
	 * column. A service answers each figure only as far as this person's permissions reach (money needs the money group).
	 * Mapped onto the service's reports routes; a figure it cannot give for the slice asked is `null`.
	 */
	report(app: AppSlug, query: ReportQuery): Promise<Report>;
	/** The person's own capabilities in the app, or — with `as` — those a role or member would hold (roles administrators). */
	capabilities(subject: string, app: AppSlug, as?: ViewAsTarget): Promise<Capabilities>;
	/** The app's whole team, for the "Vezi ca…" picker and the journal's names. */
	members(app: AppSlug): Promise<ReadonlyArray<TeamMember>>;
	/** ONE page (LIST_PAGE) of the team by name, after `cursor` (null: the first): the members' list. */
	memberPage(app: AppSlug, cursor: string | null): Promise<Paged<TeamMember>>;
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
	/** People of the staff sign-in group matching a name or an e-mail (never a client's account); at most 20. */
	searchStaff(app: AppSlug, query: string): Promise<ReadonlyArray<StaffMatch>>;
	/**
	 * Invites someone by e-mail: their account is found or made in the staff group, they are added with these roles and
	 * e-mailed. Refuses (`conflict`, with the service's reason) a client's account, a switched-off one, someone already in
	 * the team; (`unavailable`) when the sign-in cannot be reached or no staff group is configured.
	 */
	inviteMember(app: AppSlug, input: InviteInput): Promise<InviteOutcome>;
	/**
	 * The set-password link of a member who has never signed in: the sign-in answers the same one for 30 minutes. Refuses (`conflict`, with the service's
	 * reason) one who already signed in, has no e-mail or no account of theirs in the staff group.
	 */
	newSignInLink(app: AppSlug, subject: string): Promise<SignInLink>;
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
	/**
	 * ONE page of the client list (`cursor` null: the first) with the rich rows of those clients only: what the list
	 * screen shows, a page at a time, however many clients the clinic has. `nextCursor` null: the last page.
	 */
	clientPage(
		app: AppSlug,
		filter: ClientFilter,
		query: string,
		cursor: string | null,
	): Promise<ClientPage>;
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
	/**
	 * ONE page of a client's files, newest first, after `cursor` (null: the first). A page may hold fewer than LIST_PAGE
	 * (an upload never finished is not shown): only a null `nextCursor` says it is the last.
	 */
	filePage(app: AppSlug, clientId: string, cursor: string | null): Promise<Paged<ClientFile>>;
	/** Refuses (`invalid`) an empty or too big file or one of a type the clinic does not keep. */
	uploadFile(app: AppSlug, clientId: string, file: NewFile, by: Actor): Promise<ClientFile>;
	downloadFile(
		app: AppSlug,
		id: string,
	): Promise<{ name: string; contentType: string; bytes: Uint8Array }>;
	renameFile(app: AppSlug, id: string, name: string): Promise<ClientFile>;
	deleteFile(app: AppSlug, id: string): Promise<void>;
	/** The person's own settings in this app; the defaults (`stored: false`) while they saved none. */
	mySettings(app: AppSlug, subject: string): Promise<MySettingsView>;
	/** Replaces them; the same set again changes nothing. `invalid` for a set the service does not take. */
	saveMySettings(app: AppSlug, subject: string, settings: MySettings): Promise<MySettingsView>;
	/** How the person is told things here: their switches per kind and channel, quiet hours, and what each kind offers. */
	myNotifications(app: AppSlug, subject: string): Promise<MyNotificationsView>;
	/**
	 * Replaces those choices whole. `invalid` for a kind or channel that does not exist, or a channel that cannot be
	 * switched off; nothing is saved then.
	 */
	saveMyNotifications(
		app: AppSlug,
		subject: string,
		prefs: MyNotifications,
	): Promise<MyNotificationsView>;
	/** How this person's assistant shows (`null`: they never chose). Refuses `not-available-yet` while the service keeps none. */
	assistantMode(subject: string): Promise<AssistantMode | null>;
	saveAssistantMode(subject: string, mode: AssistantMode): Promise<void>;
}

/**
 * The port acting for one request's person. The scheduling service authorizes with the person's own token, so a port
 * is built per request; the in-memory fake ignores who asks.
 */
export interface PortSource {
	/** `viewAs` makes every call carry the read-only header the service refuses writes on. */
	forPerson(c: import("hono").Context, viewAs?: ViewAsTarget): Promise<ClinicPort>;
}
