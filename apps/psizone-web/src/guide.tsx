import { GuideMessage } from "@psi/ui";
import type { Context } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** What Datastar posts: the page's signals. */
export const AskBody = z.object({ question: z.string().trim().min(1).max(500) });

type Phase =
	| { kind: "thinking" }
	| { kind: "writing"; text: string }
	| { kind: "done"; text: string };

/** The guide's answer region, patched by id on every step of the stream. */
function GuideAnswer({
	locale,
	question,
	phase,
}: {
	locale: Locale;
	question: string;
	phase: Phase;
}): JSX.Element {
	const o = at(locale);
	return (
		<div
			id="guide-answer"
			class="mt-4 space-y-3"
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
							? [{ label: m.guide_source_contact({}, o), href: `${base(locale)}/contact` }]
							: []
					}
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

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Streams the answer as Datastar `datastar-patch-elements` events: thinking, then the text word by
 * word, then the sources. Until the reviewed knowledge base exists the answer hands over to a person.
 */
export function streamAnswer(c: Context, locale: Locale, question: string): Response {
	const answer = m.guide_soon({}, at(locale));
	const words = answer.split(" ");
	return streamSSE(c, async (stream) => {
		const patch = async (phase: Phase): Promise<void> => {
			const html = (
				await (<GuideAnswer locale={locale} question={question} phase={phase} />).toString()
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
