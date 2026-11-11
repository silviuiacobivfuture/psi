import { GuideMessage } from "@psi/ui";
import type { Context } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { EDITORIAL_POLICY } from "./content/editorial-policy";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { routes } from "./routes";

/** What Datastar posts: all of the page's signals. Only the asking fields matter here. */
export const AskSignals = z.object({
	question: z.string().optional(),
	compassQuery: z.string().optional(),
});

/** The question the asking field holds: the compass's query, or the page's ask bar. */
export const Question = z.string().trim().min(1).max(500);

/** The answer regions a page has: the ask bar's and the compass's. */
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

type Phase =
	| { kind: "thinking" }
	| { kind: "writing"; text: string }
	| { kind: "done"; text: string };

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
	return (
		<div
			id={target}
			class={target === "guide-answer" ? "mt-5 space-y-3" : "space-y-3"}
			aria-live="polite"
			aria-busy={phase.kind === "done" ? "false" : "true"}
		>
			<GuideMessage from="user">{question}</GuideMessage>
			{phase.kind === "thinking" ? (
				<GuideMessage>
					<span class="text-ink-muted">{m.guide_thinking({}, o)}</span>
				</GuideMessage>
			) : (
				<GuideMessage
					sources={
						phase.kind === "done"
							? [
									{
										label: EDITORIAL_POLICY.title[locale],
										href: routes.article(locale, EDITORIAL_POLICY.slug),
									},
								]
							: []
					}
				>
					<span class="pz-stream" data-done={phase.kind === "done" ? "" : undefined}>
						{phase.text}
					</span>
					{phase.kind === "done" ? (
						<p class="mt-3 text-body-sm text-ink-muted">{m.guide_footer({}, o)}</p>
					) : null}
				</GuideMessage>
			)}
		</div>
	);
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Streams the answer as Datastar `datastar-patch-elements` events: thinking, then the text word by
 * word, then the source. Until reviewed articles exist, the guide says so honestly and points to
 * how they are written and reviewed; it never answers a health question from nothing.
 */
export function streamAnswer(
	c: Context,
	locale: Locale,
	question: string,
	target: AnswerTarget,
): Response {
	const answer = m.guide_soon({}, at(locale));
	const words = answer.split(" ");
	return streamSSE(c, async (stream) => {
		const patch = async (phase: Phase): Promise<void> => {
			const html = (
				await (
					<GuideAnswer locale={locale} question={question} phase={phase} target={target} />
				).toString()
			).replace(/\n/g, " ");
			await stream.writeSSE({ event: "datastar-patch-elements", data: `elements ${html}` });
		};
		await patch({ kind: "thinking" });
		await pause(650);
		for (let i = 1; i <= words.length; i++) {
			await patch({ kind: "writing", text: words.slice(0, i).join(" ") });
			await pause(38);
		}
		await patch({ kind: "done", text: answer });
	});
}
