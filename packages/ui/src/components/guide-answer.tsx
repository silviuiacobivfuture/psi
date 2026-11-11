/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { RefusalReason, Source } from "@psi/guide";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { GuideMessage, type GuideSource } from "./guide-message";

/** The answer regions a page has: the page's own asking field and the compass's. */
export const ANSWER_TARGETS = ["guide-answer", "compass-answer"] as const;
export type AnswerTarget = (typeof ANSWER_TARGETS)[number];

/** One step of the answer region: what the visitor sees while the guide streams. */
export type GuidePhase =
	| { kind: "thinking" }
	| { kind: "writing"; text: string }
	| { kind: "done"; text: string; sources: ReadonlyArray<Source> }
	| { kind: "refused"; reason: RefusalReason };

/**
 * Every word the answer region shows, from the app's own i18n: the library ships none.
 * `refusals.crisis` is rendered as given (the app's fixed, factual, brand-owned block); the other
 * refusals are inline content, each rendered inside a paragraph.
 */
export interface GuideLabels {
	/** Shown while the guide searches. */
	thinking: string;
	/** Under a finished answer. */
	footer: string;
	/** Where a refusal (other than crisis) sends the visitor. */
	contact: GuideSource;
	/** The review line a source carries when it has a reviewer and a date. */
	reviewedBy: (name: string, date: string) => string;
	refusals: Record<RefusalReason, Child>;
}

export interface GuideAnswerProps {
	labels: GuideLabels;
	question: string;
	phase: GuidePhase;
	target: AnswerTarget;
	/** The region's layout classes; the site decides its spacing. */
	class?: string;
}

function sourceLink(source: Source, labels: GuideLabels): GuideSource {
	const reviewed =
		source.reviewedBy !== null && source.reviewedAt !== null
			? ` · ${labels.reviewedBy(source.reviewedBy, source.reviewedAt)}`
			: "";
	return { label: `${source.title}${reviewed}`, href: source.url };
}

function RefusalText({
	reason,
	labels,
}: {
	reason: RefusalReason;
	labels: GuideLabels;
}): JSX.Element {
	if (reason === "crisis") return <>{labels.refusals.crisis}</>;
	return <p>{labels.refusals[reason]}</p>;
}

/** The guide's answer region, patched by id (the target) on every step of the stream. */
export function GuideAnswer({
	labels,
	question,
	phase,
	target,
	class: className = "mt-4 space-y-3",
}: GuideAnswerProps): JSX.Element {
	return (
		<div
			id={target}
			class={className}
			aria-live="polite"
			aria-busy={phase.kind === "thinking" || phase.kind === "writing" ? "true" : "false"}
		>
			<GuideMessage from="user">{question}</GuideMessage>
			{phase.kind === "thinking" ? (
				<GuideMessage>
					<span class="text-ink-muted">{labels.thinking}</span>
				</GuideMessage>
			) : phase.kind === "refused" ? (
				<GuideMessage sources={phase.reason === "crisis" ? [] : [labels.contact]}>
					<RefusalText reason={phase.reason} labels={labels} />
				</GuideMessage>
			) : (
				<GuideMessage
					sources={phase.kind === "done" ? phase.sources.map((s) => sourceLink(s, labels)) : []}
				>
					<span class="pz-stream" data-done={phase.kind === "done" ? "" : undefined}>
						{phase.text}
					</span>
					{phase.kind === "done" ? (
						<p class="mt-3 text-body-sm text-ink-faint">{labels.footer}</p>
					) : null}
				</GuideMessage>
			)}
		</div>
	);
}
