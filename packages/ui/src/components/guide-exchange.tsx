/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import {
	type BookingOffer,
	type GuideEvent,
	isCiteOnly,
	type RefusalReason,
	type Source,
} from "@psi/guide";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { GuideLabels } from "./guide-labels";
import { GuideMessage, type GuideSource } from "./guide-message";

/** What the guide is doing while it prepares an answer (the engine's optional `thinking.stage`). */
export type ThinkingStage = NonNullable<Extract<GuideEvent, { type: "thinking" }>["stage"]>;

/** One step of an exchange: what the visitor sees under their question. */
export type GuidePhase =
	| { kind: "thinking"; stage?: ThinkingStage }
	| { kind: "writing"; text: string }
	| { kind: "done"; text: string; sources: ReadonlyArray<Source> }
	| { kind: "refused"; reason: RefusalReason }
	/** Free times to book, offered in the conversation (a brand that schedules). */
	| { kind: "booking"; offer: BookingOffer }
	/** The question has no answer and can be asked again (a dropped stream, a reload mid-answer). */
	| { kind: "unanswered" }
	/** A newer question replaced this one before it was answered: it stays, quietly, unanswered. */
	| { kind: "superseded" };

/**
 * How long a busy exchange waits after its last patch before it gives up on the stream. The engine
 * ends every answer within its own deadline (60 s by default); this covers a stream that broke.
 */
export const STALL_MS = 75_000;

/**
 * A JavaScript string literal for `text` that is safe inside a Datastar expression: `$` and `@`
 * are written as escapes, so a question like "costs $5 @post(" never reads as a signal or action.
 */
export function jsString(text: string): string {
	return JSON.stringify(text).replace(/[$@]/g, (c) => `\\u00${c.charCodeAt(0).toString(16)}`);
}

/**
 * Asks `question` again from the field that owns `target` (the form whose `aria-controls` names
 * it): this exchange is removed first, so the new attempt is the only copy of the question.
 */
export function retryExpression(target: string, question: string): string {
	return `const f = document.querySelector('form[aria-controls="${target}"]'); el.closest('.pz-exchange')?.remove(); f?.dispatchEvent(new CustomEvent('psi-guide-ask', { detail: ${jsString(question)} }))`;
}

/**
 * While an exchange is busy: when a newer question from the same field starts, this one settles as
 * unanswered (no fallback, no "unavailable"); when its own request ends, fails or stalls while the
 * exchange is still busy, the stream broke and the retry note shows. The field is the element whose
 * `aria-controls` names the transcript; nothing else (a booking form, a restore) is watched.
 */
const RECOVER = [
	"const ex = el.closest('.pz-exchange')",
	"const region = ex?.parentElement",
	"let timer = 0",
	"const onFetch = (evt) => { if (!el.isConnected) { document.removeEventListener('datastar-fetch', onFetch); return } const src = evt.detail?.el; if (!src || src.getAttribute?.('aria-controls') !== region?.id) return; const type = evt.detail?.type; if (type === 'started') settle('superseded'); else if (type === 'finished' || type === 'error' || type === 'retries-failed') settle('dropped') }",
	"const settle = (kind) => { document.removeEventListener('datastar-fetch', onFetch); clearTimeout(timer); if (!el.isConnected || !ex) return; ex.querySelectorAll('[data-guide-busy]').forEach((n) => n.remove()); const note = ex.querySelector(kind === 'dropped' ? '[data-guide-dropped]' : '[data-guide-superseded]'); if (note) note.style.display = ''; ex.setAttribute('aria-busy', 'false'); ex.dispatchEvent(new CustomEvent('psi-guide-settled', { bubbles: true })) }",
	`timer = setTimeout(() => settle('dropped'), ${STALL_MS})`,
	"document.addEventListener('datastar-fetch', onFetch)",
].join("; ");

function sourceLink(source: Source, labels: GuideLabels): GuideSource {
	const reviewed =
		source.reviewedBy !== null && source.reviewedAt !== null
			? ` · ${labels.reviewedBy(source.reviewedBy, source.reviewedAt)}`
			: "";
	// An uploaded document that is not public-downloadable is cited by its title, with no link.
	const label = `${source.title}${reviewed}`;
	return isCiteOnly(source.url) ? { label } : { label, href: source.url };
}

/** Citation markers ("[1]") of an answer shown without its sources (a restored transcript). */
export function withoutCitations(text: string): string {
	return text.replace(/\s*\[\d+(?:\s*[,–-]\s*\d+)*\]/g, "").replace(/[ \t]+([.,;:!?])/g, "$1");
}

/** A link the answer may carry: a path on this site, never another origin or a script. */
function safeHref(href: string): string | undefined {
	// No "//" and no backslash anywhere: browsers read "/\host" as another origin.
	return /^\/(?![/\\])[^\s"'<>\\]*$/.test(href) || /^#[\w-]*$/.test(href) ? href : undefined;
}

/**
 * The little markdown a model writes inline, as elements (never as HTML): `**bold**` and
 * `[label](/path)` for a path on this site; any other link keeps only its label.
 */
export function Inline({ text }: { text: string }): JSX.Element {
	const parts: Array<string | JSX.Element> = [];
	const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
	let last = 0;
	for (const m of text.matchAll(pattern)) {
		const at = m.index ?? 0;
		if (at > last) parts.push(text.slice(last, at));
		const [, bold, label, href] = m;
		if (bold !== undefined) parts.push(<strong>{bold}</strong>);
		else if (label !== undefined) {
			const safe = href === undefined ? undefined : safeHref(href);
			parts.push(safe === undefined ? label : <a href={safe}>{label}</a>);
		}
		last = at + m[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return <>{parts}</>;
}

/**
 * The answer's paragraphs, each its own block: the stream sends one line per patch, so blank
 * lines in the model's text would otherwise collapse and run sentences together.
 */
export function Paragraphs({ text }: { text: string }): JSX.Element {
	const parts = text
		.split(/\n\s*\n|\n/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	return (
		<>
			{parts.map((p) => (
				<span class="pz-para">
					<Inline text={p} />
				</span>
			))}
		</>
	);
}

export function RefusalText({
	reason,
	labels,
}: {
	reason: RefusalReason;
	labels: GuideLabels;
}): JSX.Element {
	if (reason === "crisis") return <>{labels.refusals.crisis}</>;
	return <p>{labels.refusals[reason]}</p>;
}

/** The note under an unanswered question, with the way to ask it again when there is one. */
function Unanswered({
	text,
	retry,
	labels,
}: {
	text: string;
	retry: string | undefined;
	labels: GuideLabels;
}): JSX.Element {
	return (
		<p class="pz-exchange__note">
			<span>{text}</span>
			{retry === undefined ? null : (
				<button type="button" class="pz-exchange__retry" data-on:click={retry}>
					{labels.retry}
				</button>
			)}
		</p>
	);
}

/** The typing indicator: three dots and a soft status line. */
function Typing({ labels, stage }: { labels: GuideLabels; stage?: ThinkingStage }): JSX.Element {
	return (
		<GuideMessage class="pz-msg--typing">
			<span class="pz-typing" role="status">
				<span class="pz-typing__dots" aria-hidden="true">
					<i />
					<i />
					<i />
				</span>
				<span class="pz-typing__label">
					{stage === undefined ? labels.thinking : labels.stages[stage]}
				</span>
			</span>
		</GuideMessage>
	);
}

export interface GuideExchangeProps {
	/** The exchange's element id; the stream patches it on every step. */
	id?: string;
	labels: GuideLabels;
	question: string;
	phase: GuidePhase;
	/** The Datastar expression that asks the question again (see `retryExpression`). */
	retry?: string;
	/** Show the "reviewed content" line under a finished answer (the page's own asking field). */
	footer?: boolean;
	/** A restored transcript: answers come without their sources, so citation markers go too. */
	restored?: boolean;
}

/** The phase under the question, as one guide message (or the unanswered note). */
function Reply({
	labels,
	phase,
	retry,
	footer,
	restored,
}: Omit<GuideExchangeProps, "id" | "question">): JSX.Element {
	switch (phase.kind) {
		case "thinking":
			return (
				<div data-guide-busy="">
					<Typing labels={labels} {...(phase.stage === undefined ? {} : { stage: phase.stage })} />
				</div>
			);
		case "writing":
			return (
				<div data-guide-busy="">
					<GuideMessage>
						<span class="pz-stream">
							<Paragraphs text={phase.text} />
						</span>
					</GuideMessage>
				</div>
			);
		case "done":
			return (
				<GuideMessage sources={phase.sources.map((s) => sourceLink(s, labels))}>
					<span class="pz-stream" data-done="">
						<Paragraphs text={restored === true ? withoutCitations(phase.text) : phase.text} />
					</span>
					{footer === true ? <p class="pz-msg__footer">{labels.footer}</p> : null}
				</GuideMessage>
			);
		case "refused":
			return (
				<>
					<GuideMessage sources={phase.reason === "crisis" ? [] : [labels.contact]}>
						<RefusalText reason={phase.reason} labels={labels} />
					</GuideMessage>
					{phase.reason === "unavailable" && retry !== undefined ? (
						<Unanswered text="" retry={retry} labels={labels} />
					) : null}
				</>
			);
		case "booking":
			return labels.booking === undefined ? (
				<GuideMessage sources={[labels.contact]}>
					<RefusalText reason="unavailable" labels={labels} />
				</GuideMessage>
			) : (
				<div data-booking-summary={labels.booking.summary}>
					<GuideMessage class="pz-msg--wide">{labels.booking.render(phase.offer)}</GuideMessage>
				</div>
			);
		case "unanswered":
			return <Unanswered text={labels.dropped} retry={retry} labels={labels} />;
		case "superseded":
			return <Unanswered text={labels.unanswered} retry={undefined} labels={labels} />;
	}
}

/**
 * One exchange of the conversation: the visitor's question and what the guide made of it. The
 * stream appends it to the transcript, then patches it by id as the answer arrives; earlier
 * exchanges are never re-rendered, so their sources and forms stay as they were.
 */
export function GuideExchange({
	id,
	labels,
	question,
	phase,
	retry,
	footer,
	restored,
}: GuideExchangeProps): JSX.Element {
	const busy = phase.kind === "thinking" || phase.kind === "writing";
	return (
		<div id={id} class="pz-exchange" aria-busy={busy ? "true" : "false"}>
			<GuideMessage from="user">{question}</GuideMessage>
			<Reply
				labels={labels}
				phase={phase}
				{...(retry === undefined ? {} : { retry })}
				{...(footer === undefined ? {} : { footer })}
				{...(restored === undefined ? {} : { restored })}
			/>
			{busy ? (
				<>
					<div data-guide-recover="" style="display: none" data-init={RECOVER} />
					<div data-guide-dropped="" style="display: none">
						<Unanswered text={labels.dropped} retry={retry} labels={labels} />
					</div>
					<div data-guide-superseded="" style="display: none">
						<Unanswered text={labels.unanswered} retry={undefined} labels={labels} />
					</div>
				</>
			) : null}
		</div>
	);
}
