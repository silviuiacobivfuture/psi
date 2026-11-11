import { GuideMessage } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** What Datastar posts: the page's signals. */
export const AskBody = z.object({ question: z.string().trim().min(1).max(500) });

/** The guide's answer region, patched by id. Until the knowledge base exists, it hands over to a person. */
export function GuideAnswer({
	locale,
	question,
}: {
	locale: Locale;
	question: string;
}): JSX.Element {
	const o = at(locale);
	return (
		<div id="guide-answer" class="mt-5 space-y-3" aria-live="polite">
			<GuideMessage from="user">{m.guide_you_asked({ question }, o)}</GuideMessage>
			<GuideMessage
				sources={[{ label: m.guide_source_contact({}, o), href: `${base(locale)}/contact` }]}
			>
				{m.guide_soon({}, o)}
			</GuideMessage>
		</div>
	);
}
