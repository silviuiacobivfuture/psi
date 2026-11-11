import { GuideMessage } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** What Datastar posts: all of the page's signals (the guide section's question and the compass's query). */
export const AskSignals = z.object({
	question: z.string().optional(),
	compassQuery: z.string().optional(),
});

/** The question the asking field holds. */
export const Question = z.string().trim().min(1).max(500);

/** The answer regions the page has: the guide section's and the compass's. */
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

/** The guide's answer, patched into the region that asked (by id). Until the reviewed knowledge base exists, it points to the FAQ. */
export function GuideAnswer({
	locale,
	question,
	target,
}: {
	locale: Locale;
	question: string;
	target: AnswerTarget;
}): JSX.Element {
	const o = at(locale);
	return (
		<div id={target} class="mt-6 space-y-3" aria-live="polite">
			<GuideMessage from="user">{m.guide_you_asked({ question }, o)}</GuideMessage>
			<GuideMessage
				sources={[{ label: m.guide_source_faq({}, o), href: `${base(locale)}/#intrebari` }]}
			>
				{m.guide_soon({}, o)}
			</GuideMessage>
		</div>
	);
}
