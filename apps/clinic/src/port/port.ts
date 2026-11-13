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

/** The refusal the port gives; a screen turns it into its error state, never a blank page. */
export class PortError extends Error {
	constructor(
		readonly code: "unavailable" | "not-found" | "invalid",
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
	audit(app: AppSlug): Promise<ReadonlyArray<AuditEvent>>;
	pushPrefs(subject: string): Promise<PushPrefs>;
	savePushPrefs(subject: string, prefs: PushPrefs): Promise<void>;
}
