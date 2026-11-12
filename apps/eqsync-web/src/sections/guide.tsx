import { AskBar, GuideMessage } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { guideCopy } from "../guide-copy";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** The AI guide: an input first, a chat second. Answers patch into #guide-answer in place. */
export function Guide({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="ghid" class="mx-auto max-w-6xl scroll-mt-28 px-5 py-24 md:py-32">
			<div class="grid grid-cols-1 gap-12 lg:grid-cols-12">
				<div class="lg:col-span-4">
					<p class="eq-overline">{m.guide_overline({}, o)}</p>
					<h2 class="display eq-h2 pz-rise mt-5 text-ink">{m.guide_title({}, o)}</h2>
					<p class="pz-rise mt-6 text-body text-ink-muted">{m.guide_text({}, o)}</p>
					<p class="mt-6 text-data text-ink-faint">{m.guide_footnote({}, o)}</p>
				</div>
				<div class="eq-guide pz-edge pz-rise rounded-lg p-4 md:p-7 lg:col-span-8">
					<AskBar
						action={`${base(locale)}/ghid`}
						target="guide-answer"
						label={m.ask_label({}, o)}
						placeholder={m.ask_placeholder({}, o)}
						sendLabel={m.ask_send({}, o)}
						suggestions={guideCopy(locale).chips}
					/>
					<div id="guide-answer" class="mt-6" aria-live="polite">
						<GuideMessage>{guideCopy(locale).welcome}</GuideMessage>
					</div>
				</div>
			</div>
		</section>
	);
}
