import type { Source } from "@psi/guide";
import { GuideMessage, type GuideSource } from "@psi/ui";
import type { Context } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { guide } from "./guide-client";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** What Datastar posts: the page's signals (the hero's question and the compass's query). */
export const AskSignals = z.object({
	question: z.string().optional(),
	compassQuery: z.string().optional(),
});

/** The question the asking field holds: the compass's query, or the hero's question. */
export const Question = z.string().trim().min(1).max(500);

/** The answer regions a page has: the hero's and the compass's. */
export const AnswerTarget = z.enum(["guide-answer", "compass-answer"]).catch("guide-answer");
export type AnswerTarget = z.infer<typeof AnswerTarget>;

/** Picks the question from the field that asked. */
export function questionFor(
	target: AnswerTarget,
	signals: z.infer<typeof AskSignals>,
): string | null {
	const parsed = Question.safeParse(
		target === "compass-answer" ? signals.compassQuery : signals.question,
	);
	return parsed.success ? parsed.data : null;
}

type Refusal = "crisis" | "out_of_scope" | "no_content" | "unavailable";

type Phase =
	| { kind: "thinking" }
	| { kind: "writing"; text: string }
	| { kind: "done"; text: string; sources: ReadonlyArray<Source> }
	| { kind: "refused"; reason: Refusal };

/** The centre's public phone numbers, for the crisis line. */
const PHONES: ReadonlyArray<{ display: string; tel: string }> = [
	{ display: "0748 017 752", tel: "+40748017752" },
	{ display: "0752 466 792", tel: "+40752466792" },
];

function sourceLink(source: Source, locale: Locale): GuideSource {
	const reviewed =
		source.reviewedBy !== null && source.reviewedAt !== null
			? ` · ${m.guide_reviewed_by({ name: source.reviewedBy, date: source.reviewedAt }, at(locale))}`
			: "";
	return { label: `${source.title}${reviewed}`, href: source.url };
}

/** What a refusal says. The crisis copy is fixed and factual, never generated. */
function RefusalText({ reason, locale }: { reason: Refusal; locale: Locale }): JSX.Element {
	const o = at(locale);
	switch (reason) {
		case "crisis":
			return (
				<div class="space-y-2">
					<p class="font-semibold">{m.guide_refusal_crisis({}, o)}</p>
					<p>
						{`${m.guide_refusal_crisis_clinic({}, o)} `}
						{PHONES.map((p, i) => (
							<>
								{i > 0 ? " · " : ""}
								<a class="font-mono underline" href={`tel:${p.tel}`}>
									{p.display}
								</a>
							</>
						))}
					</p>
				</div>
			);
		case "out_of_scope":
			return <p>{m.guide_refusal_out_of_scope({}, o)}</p>;
		case "no_content":
			return <p>{m.guide_refusal_no_content({}, o)}</p>;
		case "unavailable":
			return <p>{m.guide_refusal_unavailable({}, o)}</p>;
	}
}

/** The guide's answer region, patched by id on every step of the stream. */
function GuideAnswer({
	locale,
	question,
	phase,
	target,
}: {
	locale: Locale;
	question: string;
	phase: Phase;
	target: AnswerTarget;
}): JSX.Element {
	const o = at(locale);
	const contact: GuideSource = {
		label: m.guide_source_contact({}, o),
		href: `${base(locale)}/contact`,
	};
	return (
		<div
			id={target}
			class="mt-4 space-y-3"
			aria-live="polite"
			aria-busy={phase.kind === "thinking" || phase.kind === "writing" ? "true" : "false"}
		>
			<GuideMessage from="user">{question}</GuideMessage>
			{phase.kind === "thinking" ? (
				<GuideMessage>
					<span class="text-ink-muted">{m.guide_thinking({}, o)}</span>
				</GuideMessage>
			) : phase.kind === "refused" ? (
				<GuideMessage sources={phase.reason === "crisis" ? [] : [contact]}>
					<RefusalText reason={phase.reason} locale={locale} />
				</GuideMessage>
			) : (
				<GuideMessage
					sources={phase.kind === "done" ? phase.sources.map((s) => sourceLink(s, locale)) : []}
				>
					<span class="pz-stream" data-done={phase.kind === "done" ? "" : undefined}>
						{phase.text}
					</span>
					{phase.kind === "done" ? (
						<p class="mt-3 text-body-sm text-ink-faint">{m.guide_footer({}, o)}</p>
					) : null}
				</GuideMessage>
			)}
		</div>
	);
}

/**
 * Streams the guide's answer as Datastar `datastar-patch-elements` events: thinking, the text as it
 * arrives, then the cited sources — or a refusal, which replaces whatever was written so far.
 */
export function streamAnswer(
	c: Context,
	locale: Locale,
	question: string,
	target: AnswerTarget,
): Response {
	return streamSSE(c, async (stream) => {
		const patch = async (phase: Phase): Promise<void> => {
			const html = (
				await (
					<GuideAnswer locale={locale} question={question} phase={phase} target={target} />
				).toString()
			).replace(/\n/g, " ");
			await stream.writeSSE({ event: "datastar-patch-elements", data: `elements ${html}` });
		};
		const abort = new AbortController();
		stream.onAbort(() => abort.abort());
		let text = "";
		let sources: ReadonlyArray<Source> = [];
		let refused: Refusal | null = null;
		await patch({ kind: "thinking" });
		for await (const event of guide.ask({ question, locale }, { signal: abort.signal })) {
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
				case "refusal":
					refused = event.reason;
					await patch({ kind: "refused", reason: event.reason });
					break;
				case "done":
					if (refused === null) await patch({ kind: "done", text, sources });
					break;
			}
		}
	});
}
