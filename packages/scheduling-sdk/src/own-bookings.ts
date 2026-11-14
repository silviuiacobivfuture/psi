import { createSchedulingClient } from "./client";
import { SchedulingApiError } from "./errors";

/** A booking of the visitor's own, as a site shows it ("Programările mele"). */
export interface OwnBookingRow {
	id: string;
	reference: string;
	status: string;
	start: number;
	end: number;
	mode?: "onsite" | "online" | undefined;
	serviceSlug?: string | undefined;
	practitioner?: string | undefined;
	practitionerName?: string | undefined;
	changeUntil: number;
	canChange: boolean;
	canMove: boolean;
}

export interface OwnFreeTime {
	start: number;
	end: number;
	modes: ReadonlyArray<"onsite" | "online">;
}

/** Why the service said no, in a site's words: sign in again, too late, taken, not theirs, or not reachable. */
export type OwnRefusal = "expired" | "too_late" | "taken" | "not_found" | "unavailable";

export interface OwnBookingsOptions {
	/** The scheduling service's origin. */
	baseUrl: string;
	/** The app the site books for (`psizone`, `hemisync`). */
	app: string;
	/**
	 * The site's own service key: the site then calls for the person it signed in (`x-psi-subject`), and the first
	 * argument of every method is that person's SUBJECT. Absent, it is the person's own ID token, sent as theirs (the
	 * service must then list the site's sign-in among its issuers).
	 */
	serviceKey?: string;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
}

/** A refusal of the service as one of the site's words; anything else (the network, a bad answer) is `unavailable`. */
function refusalOf(error: unknown): OwnRefusal {
	if (!(error instanceof SchedulingApiError)) return "unavailable";
	switch (error.code) {
		case "unauthenticated":
		case "invalid_token":
			return "expired";
		case "not_found":
			return "not_found";
		case "not_allowed":
			return "too_late";
		case "slot_taken":
		case "conflict":
			return "taken";
		default:
			return "unavailable";
	}
}

async function attempt<T>(run: () => Promise<T>): Promise<T | OwnRefusal> {
	try {
		return await run();
	} catch (error) {
		return refusalOf(error);
	}
}

/**
 * The visitor's own bookings through the service, each call as THE VISITOR: their own token, or the site's key naming
 * the person it signed in (the service decides whose a booking is): list, cancel, the free times of the same person
 * and service, and a move. Matches `@psi/account`'s `OwnBookingsPort`, whose credential is the token or the subject.
 */
export function ownBookings(o: OwnBookingsOptions) {
	const as = (who: string) =>
		createSchedulingClient({
			baseUrl: o.baseUrl,
			auth:
				o.serviceKey === undefined ? { bearer: who } : { serviceKey: o.serviceKey, subject: who },
			...(o.fetch === undefined ? {} : { fetch: o.fetch }),
			...(o.timeoutMs === undefined ? {} : { timeoutMs: o.timeoutMs }),
		});
	return {
		list: (token: string): Promise<ReadonlyArray<OwnBookingRow> | OwnRefusal> =>
			attempt(async () => (await as(token).visitor.mine({ app: o.app })).items),
		cancel: (token: string, id: string): Promise<"ok" | OwnRefusal> =>
			attempt(async () => {
				await as(token).visitor.mineCancel({ app: o.app, id });
				return "ok" as const;
			}),
		freeTimes: (
			token: string,
			booking: OwnBookingRow,
			from: number,
			to: number,
		): Promise<ReadonlyArray<OwnFreeTime> | OwnRefusal> =>
			attempt(async () => {
				if (booking.serviceSlug === undefined || booking.practitioner === undefined) return [];
				const out = await as(token).visitor.slots({
					app: o.app,
					service: booking.serviceSlug,
					from,
					to,
					limit: 200,
				});
				return out.slots
					.filter((s) => s.practitioner === booking.practitioner)
					.map((s) => ({ start: s.start, end: s.end, modes: s.modes }));
			}),
		reschedule: (
			token: string,
			id: string,
			start: number,
			mode: "onsite" | "online",
		): Promise<"ok" | OwnRefusal> =>
			attempt(async () => {
				await as(token).visitor.mineReschedule({ app: o.app, id, start, mode });
				return "ok" as const;
			}),
	};
}
