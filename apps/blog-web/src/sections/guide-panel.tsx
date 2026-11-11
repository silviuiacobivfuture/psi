import { AskBar, GuideMessage } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";

/** The guide in blog tone: a hairline ask bar and the region its streamed answer is patched into. */
export function GuidePanel({
	locale,
	placeholder,
	intro,
	suggestions = [],
}: {
	locale: Locale;
	placeholder: string;
	intro: string;
	suggestions?: ReadonlyArray<string>;
}): JSX.Element {
	const o = at(locale);
	return (
		<div class="bl-guide">
			<AskBar
				action={routes.guide(locale)}
				target="guide-answer"
				label={m.ask_label({}, o)}
				placeholder={placeholder}
				sendLabel={m.ask_send({}, o)}
				suggestions={suggestions}
			/>
			<div id="guide-answer" class="mt-5" aria-live="polite">
				<GuideMessage>{intro}</GuideMessage>
			</div>
		</div>
	);
}
