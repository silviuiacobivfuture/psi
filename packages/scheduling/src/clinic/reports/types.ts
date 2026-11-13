import type { PaymentMethod } from "../money";

/**
 * What the report functions read. They are pure: the store's queries map rows into these shapes
 * (ids as text, instants as UTC ms) and the functions count. Nothing here holds a name, a contact,
 * a note or a text.
 */
export const GRANULARITIES = ["day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

/** A half-open range of instants, `[from, to)`, read in the app's zone. */
export interface Range {
	from: number;
	to: number;
	zone: string;
}

export const MAX_RANGE_DAYS = 366;

/** One calendar entry: a staff-made visit, or a booking that came through the web or the chat. */
export interface ReportAppointment {
	id: string;
	source: "visit" | "web";
	start: number;
	end: number;
	status: "held" | "requested" | "confirmed" | "cancelled" | "declined" | "expired";
	/** Visits only: whether the client came. Web bookings have none. */
	attendance?: "pending" | "attended" | "absent";
	/** The service or session type. */
	service: string;
	practitioner?: string;
	room?: string;
	device?: string;
	client?: string;
	package?: string;
	creditType?: "base" | "bonus";
}

export interface ReportFilter {
	practitioner?: string;
	room?: string;
	device?: string;
	service?: string;
	client?: string;
	source?: "visit" | "web";
	statuses?: ReadonlyArray<ReportAppointment["status"]>;
}

export interface ReportPackage {
	id: string;
	client: string;
	sessionType: string;
	totalSessions: number;
	bonusSessions: number;
	priceMinor: number;
	createdAt: number;
}

export interface ReportPayment {
	id: string;
	package?: string;
	client: string;
	amountMinor: number;
	method?: PaymentMethod;
	at: number;
}

/** The payment recorded on a visit itself (outside a package). */
export interface ReportVisitMoney {
	id: string;
	start: number;
	status: ReportAppointment["status"];
	package?: string;
	priceMinor?: number;
	amountPaidMinor?: number;
	paymentMethod?: PaymentMethod;
}

export interface ReportRosterDay {
	person: { kind: "practitioner" | "staff"; id: string };
	date: string;
	entry:
		| { status: "works"; startMinutes: number; endMinutes: number }
		| { status: "annual_leave" | "medical_leave" | "free" };
}

export interface ReportBlock {
	person: { kind: "practitioner" | "staff"; id: string };
	dateStart: string;
	dateEnd: string;
}

export interface ReportFeedback {
	kind: string;
	rating?: number;
	createdAt: number;
	status: string;
	/** The practitioner of the visit it is about, when there is one. */
	practitioner?: string;
}

export interface ReportBlacklistEvent {
	at: number;
	kind: "online_refused" | "overridden";
	entry: string;
	severity: string;
	category: string;
	matchedBy: string;
	channel: string;
	authority?: string;
}

export interface ReportWebRequest {
	/** When the visitor first held the slot. */
	created: number;
	channel: "form" | "guide" | "staff";
	status: ReportAppointment["status"];
	/** Set once the visitor submitted the hold. */
	submittedAt?: number;
}
