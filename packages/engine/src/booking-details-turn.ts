import { confirmation, wantsEdit } from "./booking-confirm";
import { QUESTION_WORDS, readFields } from "./booking-fields";
import {
	type BookingOffer,
	type BookingScope,
	confirmOffer,
	type Keep,
	NO_TALK,
	searchOffer,
	stateOf,
	type Talk,
} from "./booking-offers";
import type { BookingDetails, BookingLang, BookingState, DetailField } from "./booking-state";
import { submitBooking } from "./booking-submit";
import { fold } from "./text/normalize";

/**
 * The details step of a booking, in the chat: the guide asks for one thing at a time (name, age,
 * what is going on, phone, e-mail), reads each answer against the form's own rules, shows a
 * summary when all five are valid, and submits only on the visitor's explicit yes to it.
 */

/** What the dialogue carries from the state into the next turn. */
export function talkOf(state: BookingState | undefined, lang: BookingLang): Talk {
	return {
		...NO_TALK,
		values: state?.details ?? {},
		lang,
		...(state?.key === undefined ? {} : { key: state.key }),
	};
}

export function keepOf(state: BookingState | undefined, lang: BookingLang): Keep {
	return {
		lang,
		...(state?.details === undefined ? {} : { details: state.details }),
		...(state?.key === undefined ? {} : { key: state.key }),
	};
}

/** The field the guide last asked, for a message that told nothing. */
function askedOf(state: BookingState): Pick<Talk, "asked"> {
	return state.asked === undefined || state.asked === "confirm" ? {} : { asked: state.asked };
}

function isQuestion(typed: string): boolean {
	return typed.includes("?") || QUESTION_WORDS.test(fold(typed));
}

function audiencesOf(booking: BookingScope): BookingScope["scope"]["audiences"] {
	return booking.scope.audiences;
}

/** The chosen time, again, with the dialogue's latest reading (re-checked free every time). */
function reply(
	booking: BookingScope,
	state: BookingState,
	talk: Talk,
	now: number,
): Promise<BookingOffer> {
	if (state.chosen === undefined) throw new Error("the details step has no chosen time");
	return confirmOffer(booking, state.criteria, state.chosen, state.shown, now, talk);
}

async function confirmed(
	booking: BookingScope,
	state: BookingState,
	lang: BookingLang,
	now: number,
): Promise<BookingOffer> {
	const done = await submitBooking(booking, state, lang, now);
	const { criteria } = state;
	switch (done.kind) {
		case "booked":
			return {
				kind: "booked",
				service: criteria.service,
				status: "ok",
				slots: [],
				booked: done.booked,
				lang,
			};
		case "gone":
			return searchOffer(booking, criteria, now, "taken", keepOf(state, lang));
		case "incomplete": {
			const values: { -readonly [K in keyof BookingDetails]: BookingDetails[K] } = {
				...state.details,
			};
			delete values[done.field];
			return reply(booking, state, { ...talkOf(state, lang), values }, now);
		}
		case "unavailable":
			return {
				kind: "submit_failed",
				service: criteria.service,
				status: "unavailable",
				slots: [],
				lang,
				state: stateOf("details", criteria, state.shown, {
					...(state.chosen === undefined ? {} : { chosen: state.chosen }),
					...(state.details === undefined ? {} : { details: state.details }),
					asked: "confirm",
					lang,
					...(state.key === undefined ? {} : { key: state.key }),
				}),
			};
		default: {
			const unreachable: never = done;
			return unreachable;
		}
	}
}

/**
 * The answer to what the guide just asked, tried before anything else is read in the message, so a
 * "10" for the age is never the ten o'clock slot and a description with "anulat" in it is never a
 * cancellation. Undefined: the message answers nothing that was asked, and the normal reading goes on.
 */
export async function answerFirst(
	booking: BookingScope,
	state: BookingState,
	typed: string,
	lang: BookingLang,
	now: number,
): Promise<BookingOffer | undefined> {
	const { asked } = state;
	if (state.chosen === undefined) return undefined;
	// The words of the buttons are never a value for a field and never a new booking: "Edit" opens
	// the form at any point, a yes counts only under the summary, and anywhere else it asks again.
	if (wantsEdit(typed)) return reply(booking, state, { ...talkOf(state, lang), edit: true }, now);
	if (confirmation(typed) !== undefined) {
		if (asked === "confirm") return confirmed(booking, state, lang, now);
		return reply(booking, state, { ...talkOf(state, lang), nudge: true, ...askedOf(state) }, now);
	}
	if (asked === undefined || asked === "confirm") return undefined;
	const read = readFields(typed, state.details ?? {}, asked, audiencesOf(booking));
	if (!read.attempt) return undefined;
	return reply(
		booking,
		state,
		{
			...talkOf(state, lang),
			values: read.values,
			heard: read.heard,
			...(read.problem === undefined ? {} : { problem: read.problem }),
		},
		now,
	);
}

/**
 * Free text while a time is chosen and the answer was not the one asked for: whatever else it
 * tells is taken; a real question goes to the guide (the chosen time stays in the state); a
 * wrong answer to the asked field is named; anything else sends the visitor back to the question.
 */
export async function detailsTurn(
	booking: BookingScope,
	state: BookingState,
	typed: string,
	lang: BookingLang,
	now: number,
): Promise<BookingOffer | undefined> {
	if (state.chosen === undefined) return undefined;
	const asked: DetailField | undefined =
		state.asked !== undefined && state.asked !== "confirm" ? state.asked : undefined;
	const read = readFields(typed, state.details ?? {}, asked, audiencesOf(booking));
	if (read.heard.length === 0 && isQuestion(typed)) return undefined;
	const nothing = read.heard.length === 0 && read.problem === undefined;
	return reply(
		booking,
		state,
		{
			...talkOf(state, lang),
			values: read.values,
			heard: read.heard,
			nudge: nothing,
			...askedOf(state),
			...(read.problem === undefined ? {} : { problem: read.problem }),
		},
		now,
	);
}
