/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { BookingOffer, ConversationTurn, RefusalReason, Source } from "@psi/guide";
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
	| { kind: "refused"; reason: RefusalReason }
	/** Free times to book, offered in the conversation (a brand that schedules). */
	| { kind: "booking"; offer: BookingOffer };

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
	/**
	 * Booking inside the conversation (a brand that schedules): `render` shows the offered times as
	 * buttons and, on a click, the app's own confirm step (its booking form: name, contact,
	 * consent), which holds, confirms and gives the reference as the booking page does. `summary`
	 * is the guide's turn as the conversation remembers it. Without it, an offer shows the contact
	 * link.
	 */
	booking?: { render: (offer: BookingOffer) => Child; summary: string };
}

export interface GuideAnswerProps {
	labels: GuideLabels;
	question: string;
	/** The conversation's earlier turns, refused ones included, shown above the question. */
	history?: ReadonlyArray<ConversationTurn>;
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

/**
 * The answer's paragraphs, each its own block: the stream sends one line per patch, so blank
 * lines in the model's text would otherwise collapse and run sentences together.
 */
function Paragraphs({ text }: { text: string }): JSX.Element {
	const parts = text
		.split(/\n\s*\n|\n/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	return (
		<>
			{parts.map((p) => (
				<span class="pz-para">{p}</span>
			))}
		</>
	);
}

/**
 * How long the region waits after its last patch before it gives up on the stream. The engine
 * ends every answer within its own deadline (60 s by default); this covers a stream that broke
 * (a dropped connection, a restarted server).
 */
export const STALL_MS = 75_000;

/**
 * While the answer is on its way: if no further patch replaces this region within `STALL_MS`, or
 * the request that asked it ends or fails while this step is still on screen (a dropped stream, a
 * restarted server), the unavailable refusal is shown instead of an endless "thinking".
 */
const RECOVER = [
	"const show = () => { if (!el.isConnected) return; el.style.display = ''; el.parentElement?.querySelectorAll('[data-guide-busy]').forEach((n) => n.remove()); el.parentElement?.setAttribute('aria-busy', 'false') }",
	`setTimeout(show, ${STALL_MS})`,
	// The request that asked this region ended (Datastar's "finished", or an error) while the region
	// still shows this busy step: the stream broke before its last patch.
	"const region = el.parentElement",
	"const mine = (src) => !!src && (src.getAttribute?.('aria-controls') === region?.id || !!src.closest?.('.pz-compass')?.contains(region))",
	"const onFetch = (evt) => { if (!el.isConnected) { document.removeEventListener('datastar-fetch', onFetch); return } const type = evt.detail?.type; if ((type === 'finished' || type === 'error' || type === 'retries-failed') && mine(evt.detail?.el)) show() }",
	"document.addEventListener('datastar-fetch', onFetch)",
].join("; ");

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
	history = [],
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
			{history.map((turn) => (
				<GuideMessage from={turn.role}>
					{turn.refused === undefined ? (
						<Paragraphs text={turn.text} />
					) : (
						<RefusalText reason={turn.refused} labels={labels} />
					)}
				</GuideMessage>
			))}
			<GuideMessage from="user">{question}</GuideMessage>
			{phase.kind === "thinking" || phase.kind === "writing" ? (
				<div data-guide-fallback="" style="display: none" data-init={RECOVER}>
					<GuideMessage sources={[labels.contact]}>
						<RefusalText reason="unavailable" labels={labels} />
					</GuideMessage>
				</div>
			) : null}
			{phase.kind === "thinking" ? (
				<div data-guide-busy="">
					<GuideMessage>
						<span class="text-ink-muted">{labels.thinking}</span>
					</GuideMessage>
				</div>
			) : phase.kind === "booking" ? (
				labels.booking === undefined ? (
					<GuideMessage sources={[labels.contact]}>
						<RefusalText reason="unavailable" labels={labels} />
					</GuideMessage>
				) : (
					<GuideMessage>{labels.booking.render(phase.offer)}</GuideMessage>
				)
			) : phase.kind === "refused" ? (
				<GuideMessage sources={phase.reason === "crisis" ? [] : [labels.contact]}>
					<RefusalText reason={phase.reason} labels={labels} />
				</GuideMessage>
			) : phase.kind === "writing" ? (
				<div data-guide-busy="">
					<GuideMessage>
						<span class="pz-stream">
							<Paragraphs text={phase.text} />
						</span>
					</GuideMessage>
				</div>
			) : (
				<GuideMessage sources={phase.sources.map((s) => sourceLink(s, labels))}>
					<span class="pz-stream" data-done="">
						<Paragraphs text={phase.text} />
					</span>
					<p class="mt-3 text-body-sm text-ink-faint">{labels.footer}</p>
				</GuideMessage>
			)}
		</div>
	);
}
