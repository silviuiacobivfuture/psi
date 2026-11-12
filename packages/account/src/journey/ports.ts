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
