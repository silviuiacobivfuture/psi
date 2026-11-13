import type { Conflict, Probe } from "../domain/conflicts";
import type {
	Appointment,
	AppointmentPatch,
	AppSlug,
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

/** The refusal the port gives; a screen turns it into its error state, never a blank page. */
export class PortError extends Error {
	constructor(
		readonly code: "unavailable" | "not-found" | "invalid" | "conflict",
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
export interface ClinicPort {
	memberships(subject: string): Promise<ReadonlyArray<Membership>>;
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
	/** Cancels with a reason; the time becomes free. */
	cancelAppointment(app: AppSlug, id: string, reason: string): Promise<Appointment>;
	/** Records that the session was paid, and how. */
	collectPayment(app: AppSlug, id: string, method: PaymentMethod): Promise<Appointment>;
	/** What a time on a day collides with: the same rule the writes enforce, for showing it before saving. */
	findConflicts(app: AppSlug, probe: Probe): Promise<ReadonlyArray<Conflict>>;
	createClient(app: AppSlug, input: NewClient): Promise<Client>;
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
	services(app: AppSlug): Promise<ReadonlyArray<Service>>;
	roles(app: AppSlug): Promise<ReadonlyArray<Role>>;
	saveRole(app: AppSlug, role: Role): Promise<Role>;
	audit(app: AppSlug): Promise<ReadonlyArray<AuditEvent>>;
	pushPrefs(subject: string): Promise<PushPrefs>;
	savePushPrefs(subject: string, prefs: PushPrefs): Promise<void>;
}
