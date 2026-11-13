import {
	type BookedRequest,
	BookingDetailsSchema,
	type BookingLang,
	type BookingState,
	DETAIL_FIELDS,
	type DetailField,
} from "./booking-state";
import { within } from "./deadline";
import {
	type ProfileScheduling,
	type SchedulingContact,
	SchedulingHoldSchema,
	type SchedulingPort,
	SchedulingSubmitSchema,
} from "./scheduling/port";
import { runRequestAppointment } from "./scheduling/tools";

/**
 * The guide submits the request itself, and only from here: the visitor has seen a summary of every
 * detail and confirmed it explicitly. Everything in the state is validated again (it travelled
 * through the browser), the time is checked free, held right before the submit, and a hold is
 * given back whenever the submit does not happen. One id per conversation and slot makes a double
 * "da" or a double click submit once: the second caller gets the first one's outcome.
 */

/** How long a finished submit is remembered, to answer a repeated confirmation. */
export const LEDGER_TTL_MS = 10 * 60_000;
const LEDGER_MAX = 200;
const HOLD_TIMEOUT_MS = 8_000;
const SUBMIT_TIMEOUT_MS = 12_000;

export type SubmitOutcome =
	| { kind: "booked"; booked: BookedRequest }
	/** The time went between the summary and the yes. */
	| { kind: "gone" }
	/** A detail in the state failed its rules again: it is asked once more. */
	| { kind: "incomplete"; field: DetailField }
	/** The store is down or refused: nothing was sent. */
	| { kind: "unavailable" };

interface Entry {
	at: number;
	outcome: Promise<SubmitOutcome>;
}

const LEDGERS = new WeakMap<SchedulingPort, Map<string, Entry>>();

function ledgerOf(port: SchedulingPort): Map<string, Entry> {
	const found = LEDGERS.get(port);
	if (found !== undefined) return found;
	const made = new Map<string, Entry>();
	LEDGERS.set(port, made);
	return made;
}

/** The contact of the state, every field checked again, or the first field that fails. */
export function contactOf(state: BookingState): SchedulingContact | DetailField {
	const parsed = BookingDetailsSchema.safeParse(state.details ?? {});
	const d = parsed.success ? parsed.data : {};
	for (const field of DETAIL_FIELDS) if (d[field] === undefined) return field;
	if (d.name === undefined || d.email === undefined || d.phone === undefined) return "name";
	if (d.age === undefined || d.details === undefined) return "age";
	return { name: d.name, email: d.email, phone: d.phone, age: d.age, details: d.details };
}

async function sequence(
	port: SchedulingPort,
	scope: ProfileScheduling,
	state: BookingState,
	contact: SchedulingContact,
	lang: BookingLang,
): Promise<SubmitOutcome> {
	const { chosen } = state;
	if (chosen === undefined || port.hold === undefined || port.submit === undefined) {
		return { kind: "unavailable" };
	}
	const { hold, submit, release } = port;
	try {
		const checked = await runRequestAppointment(port, scope, {
			service: state.criteria.service,
			slotId: chosen.slotId,
			startsAt: chosen.startsAt,
		});
		if (checked.status === "no_longer_free") return { kind: "gone" };
		if (checked.status !== "needs_confirmation") return { kind: "unavailable" };
		const held = SchedulingHoldSchema.parse(
			await within(
				hold.call(port, {
					tenant: scope.tenant,
					service: state.criteria.service,
					slotId: chosen.slotId,
					locale: lang,
				}),
				HOLD_TIMEOUT_MS,
				"hold",
			),
		);
		if (!held.ok) {
			return held.reason === "slot_taken" || held.reason === "not_offered"
				? { kind: "gone" }
				: { kind: "unavailable" };
		}
		const giveBack = async (): Promise<void> => {
			try {
				await release?.call(port, { reference: held.reference, holdToken: held.holdToken });
			} catch {
				// The hold lapses on its own.
			}
		};
		try {
			const forWhom = state.details?.forWhom;
			const sent = SchedulingSubmitSchema.parse(
				await within(
					submit.call(port, {
						reference: held.reference,
						holdToken: held.holdToken,
						contact,
						...(forWhom === undefined ? {} : { audience: forWhom }),
					}),
					SUBMIT_TIMEOUT_MS,
					"submit",
				),
			);
			if (sent.ok) {
				return {
					kind: "booked",
					booked: {
						name: contact.name,
						reference: sent.reference,
						cancelCode: sent.cancelCode,
						start: sent.start,
						timeZone: sent.timeZone,
						mode: sent.mode,
						practitioner: held.practitionerName,
					},
				};
			}
			if (sent.reason === "hold_expired" || sent.reason === "not_found") return { kind: "gone" };
			await giveBack();
			return { kind: "unavailable" };
		} catch {
			await giveBack();
			return { kind: "unavailable" };
		}
	} catch {
		return { kind: "unavailable" };
	}
}

/**
 * Submits the summarised request. A repeat of the same conversation and time while the first is
 * running, or within the ledger's window after it booked, gets that first outcome back, so the
 * visitor sees the reference and the cancel code whichever of the two answers they read.
 */
export async function submitBooking(
	booking: { port: SchedulingPort; scope: ProfileScheduling },
	state: BookingState,
	lang: BookingLang,
	now: number = Date.now(),
): Promise<SubmitOutcome> {
	const contact = contactOf(state);
	if (typeof contact === "string") return { kind: "incomplete", field: contact };
	const { chosen, key } = state;
	if (chosen === undefined || key === undefined) return { kind: "unavailable" };
	const ledger = ledgerOf(booking.port);
	for (const [id, entry] of ledger) if (now - entry.at > LEDGER_TTL_MS) ledger.delete(id);
	const id = `${booking.scope.tenant}/${key}/${chosen.slotId}`;
	const repeat = ledger.get(id);
	if (repeat !== undefined) return repeat.outcome;
	if (ledger.size >= LEDGER_MAX) return { kind: "unavailable" };
	const outcome = sequence(booking.port, booking.scope, state, contact, lang);
	ledger.set(id, { at: now, outcome });
	// Only a booking is remembered: a refusal can be retried.
	void outcome.then((done) => {
		if (done.kind !== "booked") ledger.delete(id);
	});
	return outcome;
}
