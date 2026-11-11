import { AmbientField, AskBar, GuideMessage } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** "Vezi schimbarea." over the aurora; the guide's ask bar is the page's second door. */
export function Hero({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const [first, ...rest] = m.hero_title({}, o).split(" ");
	return (
		<AmbientField intensity="high" class="pz-arc -mt-20 pb-16">
			<div class="relative mx-auto flex min-h-[100svh] max-w-5xl flex-col items-center justify-center px-5 pb-24 pt-40 text-center">
				<span
					class="ring-orbit left-1/2 top-[14%] hidden size-[720px] -translate-x-1/2 lg:block"
					aria-hidden="true"
				/>
				<span
					class="ring-orbit left-1/2 top-[24%] hidden size-[480px] -translate-x-1/2 lg:block"
					aria-hidden="true"
				/>
				<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
					{m.hero_overline({}, o)}
				</p>
				<h1 class="display mt-6 text-display-xl text-ink">
					{first} <span class="pz-lumen">{rest.join(" ")}</span>
				</h1>
				<p class="mt-7 max-w-xl text-body-lg text-ink-muted">{m.hero_lead({}, o)}</p>
				<div class="pz-edge mt-12 w-full max-w-3xl rounded-xl p-4 text-left backdrop-blur-2xl md:p-6">
					<AskBar
						action={`${base(locale)}/ghid`}
						target="guide-answer"
						label={m.ask_label({}, o)}
						placeholder={m.ask_placeholder({}, o)}
						sendLabel={m.ask_send({}, o)}
						suggestions={[m.ask_suggest_1({}, o), m.ask_suggest_2({}, o), m.ask_suggest_3({}, o)]}
					/>
					<div id="guide-answer" class="mt-4" aria-live="polite">
						<GuideMessage>{m.guide_intro({}, o)}</GuideMessage>
					</div>
				</div>
				<p class="mt-8 text-body-sm text-ink-muted">{m.hero_reassure({}, o)}</p>
			</div>
		</AmbientField>
	);
}
