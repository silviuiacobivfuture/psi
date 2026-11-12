/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { createHash, randomBytes } from "node:crypto";
import {
	type BookingOffer,
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
import type { JSX } from "hono/jsx/jsx-runtime";
import { streamSSE } from "hono/streaming";
import {
	ANSWER_TARGETS,
	type AnswerTarget,
	GuideAnswer,
	type GuideLabels,
	type GuidePhase,
} from "./components/guide-answer";
import { visitorKeysFor } from "./visitor-keys";

/** The longest question an asking field takes, in characters (after trimming). */
export const MAX_ASK_LENGTH = 500;

/** What Datastar posts: the page's signals. Only the asking fields matter; the rest is dropped. */
export interface AskSignals {
	question?: string;
	compassQuery?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

/**
 * Parses the posted body (the request boundary). A body that is not an object, or an asking field
 * that is not a string, is rejected (`null`). The conversations are parsed apart: a malformed one
 * is no history, never a rejected question.
 */
export function parseAskSignals(body: unknown): AskSignals | null {
	if (!isRecord(body)) return null;
	const { question, compassQuery } = body;
	if (!optionalString(question) || !optionalString(compassQuery)) return null;
	return {
		question,
		compassQuery,
		guideTurns: parseConversation(body.guideTurns),
		compassTurns: parseConversation(body.compassTurns),
	};
}

/** The conversation the asking field carries, refused turns included (empty without signals). */
export function historyFor(
	target: AnswerTarget,
	signals: AskSignals | null | undefined,
): ReadonlyArray<ConversationTurn> {
	return signals?.[TURNS_SIGNAL[target]] ?? [];
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
	 * as `history`, and an answered question is appended to them (a signal patch). Held only in the
	 * page; nothing is stored. Without signals every question stands alone.
	 */
	signals?: AskSignals | null;
	/** Who is asking, for the rate limit. Defaults to an anonymous hash of the client address. */
	clientId?: string;
	/**
	 * The visitor's keys for the exchange limit. Defaults to `visitorKeysFor(c)`: a session
	 * cookie, a browser cookie and a daily fingerprint, each counted on its own.
	 */
	visitorKeys?: ReadonlyArray<string>;
	/** The answer region's layout classes (see `GuideAnswer`). */
	class?: string;
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

/** The answer region with only the unavailable refusal: what is sent when rendering itself failed. */
function Fallback({ target, labels }: { target: AnswerTarget; labels: GuideLabels }): JSX.Element {
	return (
		<div id={target} aria-live="polite" aria-busy="false">
			<p>{labels.refusals.unavailable}</p>
		</div>
	);
}

/**
 * Streams the guide's answer as Datastar `datastar-patch-elements` events: the asking field
 * emptied first, then thinking, the text as it arrives, then the cited sources — or a refusal,
 * which replaces whatever was written so far. In conversation mode the earlier turns are shown
 * above the question; the answered ones (never the refused) go to the guide as `history`; the
 * finished turn, answered or refused, is appended to the page's turns signal
 * (`datastar-patch-signals`). Every stream ends with an answer or a refusal: a failure while
 * streaming patches the unavailable refusal in. Closing the connection aborts the model call.
 */
export function streamGuideAnswer(
	c: Context,
	{
		guide,
		locale,
		question,
		target,
		labels,
		signals,
		clientId,
		visitorKeys,
		class: className,
	}: GuideAnswerRequest,
): Response {
	const turns = historyFor(target, signals);
	const history = historyOf(turns);
	// Cookies are set before the stream starts, while headers can still change.
	const keys = visitorKeys ?? visitorKeysFor(c);
	return streamSSE(c, async (stream) => {
		const patch = async (phase: GuidePhase): Promise<void> => {
			const html = (
				await (
					<GuideAnswer
						labels={labels}
						question={question}
						history={turns}
						phase={phase}
						target={target}
						class={className}
					/>
				).toString()
			).replace(/\n/g, " ");
			await stream.writeSSE({ event: "datastar-patch-elements", data: `elements ${html}` });
		};
		const remember = async (reply: { answer: string } | { refused: RefusalReason }) => {
			const next = continueConversation(turns, question, reply);
			await stream.writeSSE({
				event: "datastar-patch-signals",
				data: `signals ${JSON.stringify({ [TURNS_SIGNAL[target]]: next })}`,
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
			// The question now shows in the answer region: empty both inputs that can send one (the
			// page's ask bar and the compass), as a chat does once a message is sent.
			await stream.writeSSE({
				event: "datastar-patch-signals",
				data: `signals {"question": "", "compassQuery": ""}`,
			});
			await patch({ kind: "thinking" });
			for await (const event of guide.ask(
				{ question, locale, ...(history.length === 0 ? {} : { history }) },
				{ signal: abort.signal, clientId: clientId ?? anonymousClientId(c), visitorKeys: keys },
			)) {
				switch (event.type) {
					case "thinking":
						break;
					case "text":
						text += event.delta;
						await patch({ kind: "writing", text });
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
						finished = true;
						if (refused === null && offer !== undefined) {
							await patch({ kind: "booking", offer });
							await remember({ answer: labels.booking?.summary ?? text });
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
		// The stream broke before the guide finished: never leave the visitor at "thinking".
		try {
			await patch({ kind: "refused", reason: "unavailable" });
		} catch {
			const html = (await (<Fallback target={target} labels={labels} />).toString()).replace(
				/\n/g,
				" ",
			);
			await stream.writeSSE({ event: "datastar-patch-elements", data: `elements ${html}` });
		}
	});
}
