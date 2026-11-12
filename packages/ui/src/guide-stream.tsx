/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { createHash, randomBytes } from "node:crypto";
import {
	type BookingOffer,
	type BookingState,
	bookingStateOf,
	type ConversationTurn,
	continueConversation,
	type Guide,
	historyOf,
	type Locale,
	parseConversation,
	type RefusalReason,
	type Source,
} from "@psi/guide";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { ANSWER_TARGETS, type AnswerTarget } from "./components/guide-answer";
import { GuideExchange, type GuidePhase, retryExpression } from "./components/guide-exchange";
import type { GuideLabels } from "./components/guide-labels";
import { devLog } from "./dev-log";
import { visitorKeysFor } from "./visitor-keys";

/** The longest question an asking field takes, in characters (after trimming). */
export const MAX_ASK_LENGTH = 500;

/** What a compass post asks for: an answer, the transcript back from the kept turns, or a fresh start. */
export const COMPASS_OPS = ["ask", "restore", "reset"] as const;
export type CompassOp = (typeof COMPASS_OPS)[number];

/** What a page posts. Only the asking fields matter; every other signal is ignored. */
export interface AskSignals {
	question?: string;
	compassQuery?: string;
	/** The compass's question still waiting for its answer (a reload or a page change mid-answer). */
	compassPending?: string;
	compassOp?: CompassOp;
	/** The page ask bar's conversation so far (`$guideTurns`), parsed and bounded. */
	guideTurns?: ReadonlyArray<ConversationTurn>;
	/** The compass's conversation so far (`$compassTurns`), parsed and bounded. */
	compassTurns?: ReadonlyArray<ConversationTurn>;
}

/** The signal that holds each answer region's conversation. */
export const TURNS_SIGNAL: Readonly<Record<AnswerTarget, "guideTurns" | "compassTurns">> = {
	"guide-answer": "guideTurns",
	"compass-answer": "compassTurns",
};

const AskBodySchema = z
	.object({
		question: z.string().optional(),
		compassQuery: z.string().optional(),
		compassPending: z.string().optional(),
		compassOp: z.enum(COMPASS_OPS).optional(),
		guideTurns: z.unknown().optional(),
		compassTurns: z.unknown().optional(),
	})
	.passthrough();

/**
 * The posted turns with an empty `refused` dropped: a reactive signal object can carry the key
 * empty, and an empty reason is no refusal (anything else malformed still voids the conversation).
 */
function withoutEmptyRefusals(raw: unknown): unknown {
	if (!Array.isArray(raw)) return raw;
	return raw.map((turn: unknown) =>
		typeof turn === "object" && turn !== null && Reflect.get(turn, "refused") === ""
			? Object.fromEntries(Object.entries(turn).filter(([k]) => k !== "refused"))
			: turn,
	);
}

/**
 * Parses the posted body (the request boundary). A body that is not an object, or an asking field
 * that is not a string, is rejected (`null`). The conversations are parsed apart: a malformed one
 * is no history, never a rejected question.
 */
export function parseAskSignals(body: unknown): AskSignals | null {
	const parsed = AskBodySchema.safeParse(body);
	if (!parsed.success) return null;
	const { question, compassQuery, compassPending, compassOp } = parsed.data;
	return {
		question,
		compassQuery,
		...(compassPending === undefined ? {} : { compassPending }),
		...(compassOp === undefined ? {} : { compassOp }),
		guideTurns: parseConversation(withoutEmptyRefusals(parsed.data.guideTurns)),
		compassTurns: parseConversation(withoutEmptyRefusals(parsed.data.compassTurns)),
	};
}

/** The conversation the asking field carries, refused turns included (empty without signals). */
export function historyFor(
	target: AnswerTarget,
	signals: AskSignals | null | undefined,
): ReadonlyArray<ConversationTurn> {
	return signals?.[TURNS_SIGNAL[target]] ?? [];
}

/**
 * The `history` sent to the guide: answered exchanges only. A question left unanswered (replaced
 * by a newer one, or cut off) and a refused exchange never steer the next answer.
 */
export function guideHistory(turns: ReadonlyArray<ConversationTurn>): ReturnType<typeof historyOf> {
	return historyOf(turns.filter((t, i) => t.role !== "user" || turns[i + 1]?.role === "guide"));
}

/** Parses the `target` query parameter; anything unknown is the page's own answer region. */
export function parseAnswerTarget(value: unknown): AnswerTarget {
	return ANSWER_TARGETS.find((t) => t === value) ?? "guide-answer";
}

/** Picks the question from the field that asked: trimmed, 1–500 characters, or `null`. */
export function questionFor(target: AnswerTarget, signals: AskSignals): string | null {
	const raw = target === "compass-answer" ? signals.compassQuery : signals.question;
	const question = raw?.trim() ?? "";
	return question.length >= 1 && question.length <= MAX_ASK_LENGTH ? question : null;
}

export interface GuideAnswerRequest {
	guide: Guide;
	locale: Locale;
	question: string;
	target: AnswerTarget;
	labels: GuideLabels;
	/**
	 * The posted signals, for conversation mode: the asking field's earlier turns go to the guide
	 * as `history`, and an answered question is appended to them (a signal patch). Without signals
	 * every question stands alone.
	 */
	signals?: AskSignals | null;
	/** Who is asking, for the rate limit. Defaults to an anonymous hash of the client address. */
	clientId?: string;
	/**
	 * The visitor's keys for the exchange limit. Defaults to `visitorKeysFor(c)`: a session
	 * cookie, a browser cookie and a daily fingerprint, each counted on its own.
	 */
	visitorKeys?: ReadonlyArray<string>;
}

/** A per-process salt: the hash cannot be reversed to an address or linked across restarts. */
const SALT = randomBytes(32);

/**
 * The visitor as the rate limiter sees them: a salted hash of the first forwarded address (the
 * ingress sets it), never the address itself. Undefined when there is none, so no limit applies.
 */
export function anonymousClientId(c: Context): string | undefined {
	const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
	const address = forwarded || c.req.header("x-real-ip")?.trim();
	if (!address) return undefined;
	return createHash("sha256").update(SALT).update(address).digest("base64url");
}

/**
 * Streams the guide's answer as Datastar `datastar-patch-elements` events, as one exchange of the
 * transcript: the first patch appends it (the question and the typing indicator), every later one
 * patches it by id — the text as it arrives, a `replace` that starts the reply over, then the
 * cited sources, a refusal or the booking step. Earlier exchanges are never re-sent. The answered
 * or refused turn is appended to the field's turns (`datastar-patch-signals`). A stream that breaks
 * patches the unavailable refusal with a retry; an aborted one (a newer question, a page left)
 * patches nothing, and the page settles it as unanswered. Closing the connection aborts the model.
 */
export function streamGuideAnswer(
	c: Context,
	{ guide, locale, question, target, labels, signals, clientId, visitorKeys }: GuideAnswerRequest,
): Response {
	const turns = historyFor(target, signals);
	const history = guideHistory(turns);
	// Where a booking conversation stands travels with the page's turns, like the history.
	const booking = bookingStateOf(turns);
	// Cookies are set before the stream starts, while headers can still change.
	const keys = visitorKeys ?? visitorKeysFor(c);
	const id = `x${randomBytes(6).toString("hex")}`;
	const retry = retryExpression(target, question);
	return streamSSE(c, async (stream) => {
		let appended = false;
		const write = async (html: string): Promise<void> => {
			const flat = html.replace(/\n/g, " ");
			const data = appended
				? `elements ${flat}`
				: `selector #${target}\nmode append\nelements ${flat}`;
			appended = true;
			await stream.writeSSE({ event: "datastar-patch-elements", data });
		};
		const patch = async (phase: GuidePhase): Promise<void> => {
			await write(
				await (
					<GuideExchange
						id={id}
						labels={labels}
						question={question}
						phase={phase}
						retry={retry}
						footer={target === "guide-answer"}
					/>
				).toString(),
			);
		};
		const remember = async (
			reply: { answer: string; booking?: BookingState } | { refused: RefusalReason },
		) => {
			const next = continueConversation(turns, question, reply);
			const pending = target === "compass-answer" ? { compassPending: "" } : {};
			await stream.writeSSE({
				event: "datastar-patch-signals",
				data: `signals ${JSON.stringify({ [TURNS_SIGNAL[target]]: next, ...pending })}`,
			});
		};
		const abort = new AbortController();
		stream.onAbort(() => abort.abort());
		let text = "";
		let sources: ReadonlyArray<Source> = [];
		let refused: RefusalReason | null = null;
		let offer: BookingOffer | undefined;
		let finished = false;
		try {
			// The page's own field is emptied here; the compass empties its field as it sends.
			if (target === "guide-answer") {
				await stream.writeSSE({
					event: "datastar-patch-signals",
					data: `signals {"question": ""}`,
				});
			}
			await patch({ kind: "thinking" });
			for await (const event of guide.ask(
				{
					question,
					locale,
					...(history.length === 0 ? {} : { history }),
					...(booking === undefined ? {} : { booking }),
				},
				{
					signal: abort.signal,
					clientId: clientId ?? anonymousClientId(c),
					visitorKeys: keys,
				},
			)) {
				// A newer question replaced this one (or the visitor left): it renders nothing.
				if (abort.signal.aborted) {
					devLog("guide.aborted", {
						path: c.req.path,
						target,
						question,
						turns: turns.length,
					});
					return;
				}
				switch (event.type) {
					case "thinking":
						// What the guide is doing, while it has written nothing yet.
						if (event.stage !== undefined && text === "") {
							await patch({ kind: "thinking", stage: event.stage });
						}
						break;
					case "text":
						text += event.delta;
						await patch({ kind: "writing", text });
						break;
					case "replace":
						// The reply was regenerated or corrected: it starts over from `text` (often empty), and
						// later `text` deltas append to it. What was cited before no longer applies.
						text = event.text;
						sources = [];
						await patch(text === "" ? { kind: "thinking" } : { kind: "writing", text });
						break;
					case "sources":
						sources = event.sources;
						break;
					case "booking":
						offer = event.offer;
						break;
					case "refusal":
						refused = event.reason;
						await patch({ kind: "refused", reason: event.reason });
						break;
					case "done":
						// A reply with no words, no refusal and no booking is no answer: the stream ends as broken.
						if (refused === null && offer === undefined && text.trim() === "") break;
						finished = true;
						devLog("guide.answer", {
							path: c.req.path,
							target,
							question,
							turns: turns.length,
							outcome: refused ?? (offer === undefined ? "answered" : "booking"),
							sources: sources.length,
							text,
						});
						if (refused === null && offer !== undefined) {
							await patch({ kind: "booking", offer });
							await remember({
								answer: labels.booking?.summary(offer) ?? text,
								...(offer.state === undefined ? {} : { booking: offer.state }),
							});
						} else if (refused === null) {
							await patch({ kind: "done", text, sources });
							await remember({ answer: text });
						} else {
							await remember({ refused });
						}
						break;
				}
			}
		} catch (error) {
			if (abort.signal.aborted) return;
			console.error(`guide stream: ${error instanceof Error ? error.name : "error"}`);
		}
		if (finished || abort.signal.aborted) return;
		devLog("guide.unfinished", { path: c.req.path, question, partial: text });
		// The stream broke before the guide finished: never leave the visitor at "thinking".
		try {
			await patch({ kind: "refused", reason: "unavailable" });
		} catch {
			await write(
				await (
					<div id={id} class="pz-exchange" aria-busy="false">
						<p>{labels.refusals.unavailable}</p>
					</div>
				).toString(),
			);
		}
	});
}
