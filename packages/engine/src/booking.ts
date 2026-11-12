import type { LanguagePack } from "./language/pack";
import type { ProfileScheduling, SchedulingPort } from "./scheduling/port";
import { type ProposedSlot, runFindAvailability } from "./scheduling/tools";
import { fold } from "./text/normalize";

/**
 * Booking inside the conversation. When a profile schedules and the visitor asks to book, the
 * engine looks up free times with the scheduling tools' own `findAvailability` and sends them as a
 * `booking` event: the app renders them as buttons and, on a click, its own confirm step (the
 * booking form: name, contact, consent), which holds the time, confirms it and shows the
 * reference, exactly as its booking page does. Nothing here holds or books, no model is asked, and
 * no personal detail is read: crisis, the limits and the rules have already run.
 */

/** Free times offered in the chat, and what the lookup found. */
export interface BookingOffer {
	/** The service the times are for (the profile's first scheduling service). */
	service: string;
	status: "ok" | "none" | "unavailable";
	timeZone?: string;
	slots: ReadonlyArray<ProposedSlot>;
}

/** The profile's scheduling, when both the profile opted in and the engine was given a store. */
export interface BookingScope {
	port: SchedulingPort;
	scope: ProfileScheduling;
}

/** How many free times one offer shows, and over how many days. */
const OFFER_SLOTS = 6;
const OFFER_DAYS = 14;

/** True when the question asks to book (the packs' `bookingIntent` rules, on folded text). */
export function isBookingIntent(question: string, packs: ReadonlyArray<LanguagePack>): boolean {
	const folded = fold(question);
	return packs.some((pack) => (pack.bookingIntent ?? []).some((rule) => rule.test(folded)));
}

/** The part of the day the visitor named, if any. */
function partOfDay(question: string): "morning" | "afternoon" | "any" {
	const folded = fold(question);
	if (/\b(dimineata|dimineti|morning|mornings)\b/.test(folded)) return "morning";
	if (/\b(dupa amiaz|afternoon|afternoons)/.test(folded)) return "afternoon";
	return "any";
}

/** Looks up the next free times for the profile's first service. Never throws. */
export async function offerTimes(
	booking: BookingScope,
	question: string,
	now: number = Date.now(),
): Promise<BookingOffer> {
	const service = booking.scope.services[0] ?? "";
	const found = await runFindAvailability(
		booking.port,
		booking.scope,
		{ service, days: OFFER_DAYS, partOfDay: partOfDay(question), limit: OFFER_SLOTS },
		now,
	);
	const status = found.status === "unknown_service" ? "unavailable" : found.status;
	return {
		service,
		status,
		...(found.timeZone === undefined ? {} : { timeZone: found.timeZone }),
		slots: found.slots,
	};
}
