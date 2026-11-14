/**
 * What the journey needs from outside the account database, as ports the site wires: the scheduling
 * store for previous reservations (@psi/scheduling on Psizone), and anything a site adds to its home
 * timeline. @psi/account depends on neither.
 */

/** A person's own booking request, as the scheduling store answers for their account. */
export interface OwnReservation {
	reference: string;
	status: "requested" | "confirmed" | "cancelled" | "declined";
	mode: "onsite" | "online";
	start: number;
	end: number;
	practitionerName: string;
	submittedAt: number;
}

export interface ReservationsPort {
	/** The account's requests, newest first. Throws when the store is unreachable. */
	requests(subject: string): Promise<ReadonlyArray<OwnReservation>>;
	cancel(subject: string, reference: string): Promise<boolean>;
	/** An anonymous request, with its proof (reference + cancel code). */
	link(subject: string, reference: string, cancelCode: string): Promise<boolean>;
	/** Erasure: the requests stay with the clinic, no longer tied to the account. */
	unlink(subject: string): Promise<void>;
}

/** A booking of the person's own, as the scheduling service answers it for their token. */
export interface OwnBooking {
	/** What the service names it by in its routes (it may differ from the reference). */
	id: string;
	reference: string;
	status: string;
	start: number;
	end: number;
	mode?: "onsite" | "online" | undefined;
	serviceSlug?: string | undefined;
	practitioner?: string | undefined;
	practitionerName?: string | undefined;
	/** Until when the clinic lets it be cancelled or moved online, and whether that is still ahead. */
	changeUntil: number;
	canChange: boolean;
}

/** A free time a booking can move to. */
export interface FreeTime {
	start: number;
	end: number;
	modes: ReadonlyArray<"onsite" | "online">;
}

/**
 * Why the service said no: the person's token no longer holds (`expired`: sign in again, silently), it is past the
 * clinic's rule (`too_late`), the time was just taken (`taken`), it is not theirs or not there (`not_found`), or the
 * service could not be asked (`unavailable`).
 */
export type BookingRefusal = "expired" | "too_late" | "taken" | "not_found" | "unavailable";

/**
 * The person's own bookings through the scheduling service, called with THEIR token: the service decides whose they
 * are. Every call answers a value or a refusal; none throws for a refusal.
 */
export interface OwnBookingsPort {
	list(token: string): Promise<ReadonlyArray<OwnBooking> | BookingRefusal>;
	cancel(token: string, id: string): Promise<"ok" | BookingRefusal>;
	/** The free times of the same person and service, between two instants. */
	freeTimes(
		token: string,
		booking: OwnBooking,
		from: number,
		to: number,
	): Promise<ReadonlyArray<FreeTime> | BookingRefusal>;
	reschedule(
		token: string,
		id: string,
		start: number,
		mode: "onsite" | "online",
	): Promise<"ok" | BookingRefusal>;
}

export type TimelineKind =
	| "booking"
	| "consent_granted"
	| "consent_withdrawn"
	| "saved"
	| "conversation";

/** One line of the home timeline. `detail` is a reference, a purpose title or an article title. */
export interface TimelineEvent {
	at: number;
	kind: TimelineKind;
	detail: string;
	href?: string;
}
