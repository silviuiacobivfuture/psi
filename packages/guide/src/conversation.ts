import { type BookingState, BookingStateSchema } from "@psi/engine";
import { z } from "zod";
import {
	type HistoryTurn,
	MAX_HISTORY_TURN_LENGTH,
	MAX_HISTORY_TURNS,
	type RefusalReason,
} from "./events";

/**
 * How many earlier turns a follow-up sends as `history` (five questions and their answers). The
 * conversation lives only in the visitor's page (a Datastar signal) and travels with the next
 * question: nothing is stored on the server, so no consent is needed. Memory (`threadId`) stays
 * consent-only.
 */
export const CONVERSATION_TURNS = 10;
/** How many turns the page keeps on screen (ten exchanges). */
export const DISPLAY_TURNS = 20;

/** A turn as the page shows it: refused turns stay visible but are never sent as history. */
export interface ConversationTurn extends HistoryTurn {
	/** Set on the guide's turn when the question was refused; its text is then empty. */
	refused?: RefusalReason;
	/** Set on the guide's turn when it was a booking step: where the booking conversation stands. */
	booking?: BookingState;
}

const REASONS = [
	"crisis",
	"out_of_scope",
	"injection",
	"abuse",
	"rate_limited",
	"exchange_limit",
	"no_content",
	"unavailable",
] as const satisfies ReadonlyArray<RefusalReason>;

const TurnsSchema = z
	.array(
		z
			.object({
				role: z.enum(["user", "guide"]),
				text: z.string(),
				refused: z.enum(REASONS).optional(),
				booking: BookingStateSchema.optional(),
			})
			.strict(),
	)
	.max(DISPLAY_TURNS * 2);

/** Cuts a turn's text to the engine's limit, by code point. */
function bounded(text: string): string {
	return Array.from(text.trim()).slice(0, MAX_HISTORY_TURN_LENGTH).join("").trim();
}

function lastOf<T>(items: ReadonlyArray<T>, keep: number): ReadonlyArray<T> {
	return items.slice(Math.max(0, items.length - keep));
}

/**
 * Parses the turns a page posted (the request boundary): the last `DISPLAY_TURNS` well-formed
 * turns, each trimmed and cut to the engine's limit; blank answered turns are dropped. Anything
 * malformed is no conversation at all, so a tampered signal never refuses or steers the question.
 */
export function parseConversation(raw: unknown): ReadonlyArray<ConversationTurn> {
	const parsed = TurnsSchema.safeParse(raw);
	if (!parsed.success) return [];
	const turns = parsed.data
		.map(
			(t): ConversationTurn => ({
				role: t.role,
				text: bounded(t.text),
				...(t.refused === undefined ? {} : { refused: t.refused }),
				...(t.booking === undefined ? {} : { booking: t.booking }),
			}),
		)
		.filter((t) => t.text !== "" || t.refused !== undefined);
	return lastOf(turns, DISPLAY_TURNS);
}

/**
 * The `history` a follow-up sends: the last `keep` turns of answered exchanges. A refused
 * exchange (the question and its refusal) is left out, so it never steers the next answer.
 */
export function historyOf(
	turns: ReadonlyArray<ConversationTurn>,
	keep: number = CONVERSATION_TURNS,
): ReadonlyArray<HistoryTurn> {
	const out: Array<HistoryTurn> = [];
	turns.forEach((turn, i) => {
		const next = turns[i + 1];
		if (turn.refused !== undefined) return;
		if (turn.role === "user" && next?.role === "guide" && next.refused !== undefined) return;
		if (turn.text !== "") out.push({ role: turn.role, text: turn.text });
	});
	return lastOf(out, Math.min(keep, MAX_HISTORY_TURNS));
}

/**
 * How many of the guide's latest turns can still carry a booking conversation: the last one, or the
 * one before it when a question about something else came in between.
 */
const BOOKING_TURNS = 2;

/**
 * Where the visitor's booking conversation stands: the state of the guide's latest booking turn,
 * looking back over its last two turns only, so a booking flow that moved on is not resumed.
 */
export function bookingStateOf(turns: ReadonlyArray<ConversationTurn>): BookingState | undefined {
	const guideTurns = turns.filter((t) => t.role === "guide" && t.refused === undefined);
	for (const turn of guideTurns.slice(-BOOKING_TURNS).reverse()) {
		if (turn.booking !== undefined) return turn.booking;
	}
	return undefined;
}

/** The conversation after one question: the question and the answer (or the refusal) appended. */
export function continueConversation(
	turns: ReadonlyArray<ConversationTurn>,
	question: string,
	reply: { answer: string; booking?: BookingState } | { refused: RefusalReason },
): ReadonlyArray<ConversationTurn> {
	const guide: ConversationTurn =
		"refused" in reply
			? { role: "guide", text: "", refused: reply.refused }
			: {
					role: "guide",
					text: reply.answer,
					...(reply.booking === undefined ? {} : { booking: reply.booking }),
				};
	return parseConversation([...turns, { role: "user", text: question }, guide]);
}
