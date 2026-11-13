import type { AppMe } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import type {
	Appointment,
	AppSlug,
	AuditEvent,
	Client,
	Column,
	Membership,
	NewAppointment,
	Package,
	PushPrefs,
	Role,
	RosterEntry,
	SearchHit,
	Service,
	WebRequest,
} from "./schema";

export type ClientFilter = "current" | "archived";

export interface CalendarData {
	columns: ReadonlyArray<Column>;
	appointments: ReadonlyArray<Appointment>;
	clients: ReadonlyArray<Client>;
	services: ReadonlyArray<Service>;
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
export type Capabilities = z.output<typeof AppMe>;

/** Who the console is looking at the app as (read-only), when a roles administrator has chosen "Vezi ca…". */
export type ViewAsTarget = `role:${string}` | `member:${string}`;

export interface TeamMember {
	subject: string;
	displayName: string;
	roles: ReadonlyArray<string>;
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
	) {
		super(message);
		this.name = "PortError";
	}
}

/**
 * Everything the console reads and writes. The scheduling service's SDK implements it; until then
 * the in-memory fake does. Every call is scoped to one app: nothing crosses apps.
 */
export interface ClinicPort {
	memberships(subject: string): Promise<ReadonlyArray<Membership>>;
	calendar(app: AppSlug, from: string, to: string): Promise<CalendarData>;
	createAppointment(app: AppSlug, input: NewAppointment): Promise<Appointment>;
	search(app: AppSlug, query: string): Promise<ReadonlyArray<SearchHit>>;
	clients(app: AppSlug, filter: ClientFilter, query: string): Promise<ReadonlyArray<Client>>;
	client(app: AppSlug, id: string): Promise<Client | null>;
	clientAppointments(app: AppSlug, id: string): Promise<ReadonlyArray<Appointment>>;
	archiveClient(app: AppSlug, id: string): Promise<void>;
	deleteClient(app: AppSlug, id: string): Promise<void>;
	packages(app: AppSlug, clientId: string): Promise<ReadonlyArray<Package>>;
	savePackage(app: AppSlug, pkg: Package): Promise<Package>;
	roster(
		app: AppSlug,
		weekStart: string,
	): Promise<{ people: ReadonlyArray<Column>; entries: ReadonlyArray<RosterEntry> }>;
	requests(app: AppSlug): Promise<ReadonlyArray<WebRequest>>;
	markRequestHandled(app: AppSlug, id: string): Promise<void>;
	reminders(app: AppSlug, date: string): Promise<ReadonlyArray<ReminderItem>>;
	markReminderSent(app: AppSlug, appointmentId: string): Promise<void>;
	columns(app: AppSlug): Promise<ReadonlyArray<Column>>;
	services(app: AppSlug): Promise<ReadonlyArray<Service>>;
	roles(app: AppSlug): Promise<ReadonlyArray<Role>>;
	saveRole(app: AppSlug, role: Role): Promise<Role>;
	audit(app: AppSlug): Promise<ReadonlyArray<AuditEvent>>;
	/** The person's own capabilities in the app, or — with `as` — those a role or member would hold (roles administrators). */
	capabilities(subject: string, app: AppSlug, as?: ViewAsTarget): Promise<Capabilities>;
	/** The app's team, for the "Vezi ca…" picker. */
	members(app: AppSlug): Promise<ReadonlyArray<TeamMember>>;
	/** Starts / ends looking at the app as someone else: audited events of the administrator. */
	startViewAs(subject: string, app: AppSlug, as: ViewAsTarget): Promise<Capabilities>;
	stopViewAs(subject: string, app: AppSlug): Promise<void>;
	/**
	 * The service's live streams for the app, merged: yields a signal whenever the calendar, the requests or the inbox
	 * badge change. Reconnects with backoff by itself; ends only when `signal` aborts.
	 */
	live(app: AppSlug, signal: AbortSignal): AsyncIterable<LiveSignal>;
	pushPrefs(subject: string): Promise<PushPrefs>;
	savePushPrefs(subject: string, prefs: PushPrefs): Promise<void>;
}

/**
 * The port acting for one request's person. The scheduling service authorizes with the person's own token, so a port
 * is built per request; the in-memory fake ignores who asks.
 */
export interface PortSource {
	/** `viewAs` makes every call carry the read-only header the service refuses writes on. */
	forPerson(c: import("hono").Context, viewAs?: ViewAsTarget): Promise<ClinicPort>;
}
