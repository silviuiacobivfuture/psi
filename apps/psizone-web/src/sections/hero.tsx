import { AskBar, Button, GuideMessage } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** The centre's main public number, as published on psizone.ro. */
const PHONE = { display: "0748 017 752", tel: "+40748017752" } as const;

/**
 * The hero: the promise, two actions, the phone; beside it the centre in a photograph (a framed
 * placeholder until the shoot) over a soft beige disc, with the years of experience on a card.
 */
export function Hero({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	return (
		<section class="hero -mt-20 overflow-hidden">
			<div class="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-36 md:pt-44 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
				<div>
					<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
						{m.hero_overline({}, o)}
					</p>
					<h1 class="display mt-6 text-display-xl text-ink">{m.hero_title({}, o)}</h1>
					<p class="mt-8 max-w-xl text-body-lg text-ink-muted">{m.hero_lead({}, o)}</p>
					<div class="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
						<Button size="lg" href={`${b}/contact`}>
							{m.hero_cta_book({}, o)}
						</Button>
						<Button size="lg" variant="outline" href={`${b}/#pentru-cine`}>
							{m.hero_cta_services({}, o)}
						</Button>
					</div>
					<p class="mt-8 text-body text-ink-muted">
						{`${m.hero_call({}, o)} `}
						<a class="font-semibold text-glow-1 hover:underline" href={`tel:${PHONE.tel}`}>
							{PHONE.display}
						</a>
					</p>
				</div>
				<div class="hero-visual">
					<span class="hero-visual__disc" aria-hidden="true" />
					<figure class="hero-visual__photo">
						<figcaption>{m.hero_photo_placeholder({}, o)}</figcaption>
					</figure>
					<p class="hero-visual__stat">
						<span class="hero-visual__value">{m.hero_stat_value({}, o)}</span>
						<span class="hero-visual__label">{m.hero_stat_label({}, o)}</span>
					</p>
				</div>
			</div>
		</section>
	);
}

/** The guide, the page's second door, right under the hero. */
export function GuideSection({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section class="border-y border-line bg-surface-1">
			<div class="mx-auto max-w-3xl px-5 py-20">
				<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
					{m.guide_section_overline({}, o)}
				</p>
				<h2 class="display mt-4 text-display-md text-ink">{m.ask_label({}, o)}</h2>
				<div class="mt-8">
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
				<p class="mt-6 text-body-sm text-ink-muted">{m.hero_reassure({}, o)}</p>
			</div>
		</section>
	);
}
