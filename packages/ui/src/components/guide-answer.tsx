/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { ConversationTurn } from "@psi/guide";
import type { JSX } from "hono/jsx/jsx-runtime";
import { GuideExchange, type GuidePhase, retryExpression } from "./guide-exchange";
import type { GuideLabels } from "./guide-labels";

/** The answer regions a page has: the page's own asking field and the compass's. */
export const ANSWER_TARGETS = ["guide-answer", "compass-answer"] as const;
export type AnswerTarget = (typeof ANSWER_TARGETS)[number];

/** The compass's transcript wears its own class; the page's region takes the app's spacing. */
export function regionClass(target: AnswerTarget, appClass: string | undefined): string {
	return target === "compass-answer" ? "pz-compass__answer" : (appClass ?? "mt-4 space-y-3");
}

/** One question and what became of it, read back from the stored turns. */
interface Exchange {
	question: string;
	phase: GuidePhase;
}

/**
 * The turns as exchanges: a question with the guide's reply (answered, refused, or a booking's
 * summary), or a question the next one replaced before it was answered.
 */
export function exchangesOf(turns: ReadonlyArray<ConversationTurn>): ReadonlyArray<Exchange> {
	const out: Exchange[] = [];
	turns.forEach((turn, i) => {
		if (turn.role !== "user") return;
		const reply = turns[i + 1];
		if (reply === undefined || reply.role !== "guide") {
			out.push({ question: turn.text, phase: { kind: "superseded" } });
		} else if (reply.refused !== undefined) {
			out.push({
				question: turn.text,
				phase: { kind: "refused", reason: reply.refused },
			});
		} else {
			out.push({
				question: turn.text,
				phase: { kind: "done", text: reply.text, sources: [] },
			});
		}
	});
	return out;
}

export interface GuideAnswerProps {
	labels: GuideLabels;
	/** The conversation so far, refused and unanswered questions included. */
	turns: ReadonlyArray<ConversationTurn>;
	/** A question still waiting for its answer (the visitor left mid-answer): shown with a retry. */
	pending?: string;
	target: AnswerTarget;
	/** The region's layout classes (the page's asking field; the compass has its own). */
	class?: string;
}

/**
 * The whole transcript, as one patch: what a page restores from the turns it kept. Answers come
 * back as text (their sources are not kept); a pending question can be asked again.
 */
export function GuideAnswer({
	labels,
	turns,
	pending,
	target,
	class: className,
}: GuideAnswerProps): JSX.Element {
	return (
		<div id={target} class={regionClass(target, className)} role="log" aria-live="polite">
			{exchangesOf(turns).map((x) => (
				<GuideExchange
					labels={labels}
					question={x.question}
					phase={x.phase}
					footer={target === "guide-answer"}
					restored
				/>
			))}
			{pending === undefined || pending === "" ? null : (
				<GuideExchange
					labels={labels}
					question={pending}
					phase={{ kind: "unanswered" }}
					retry={retryExpression(target, pending)}
				/>
			)}
		</div>
	);
}
