import { AskBar, Button, GuideMessage, Picture } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { guideCopy } from "../guide-copy";
import { at, base, type Locale } from "../i18n";
import { heroPicture } from "../imagery";
import { m } from "../paraglide/messages.js";
import { heroYears, mainPhone } from "../site-settings";

/**
 * The hero: the promise, two actions, the phone; beside it a stage of rings and solid discs
 * around an arched photo slot, the years counting up on a gold box. Under both, the documented
 * facts rise in sequence. Flat; motion lives in styles.css and stops under reduced motion.
 */
export function Hero({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	// The owners' figure from the CMS, or the number in today's copy.
	const years = heroYears(Number.parseInt(m.hero_stat_value({}, o), 10));
	const phone = mainPhone();
	const words = m.hero_title({}, o).split(" ");
	const audience = [
		m.hero_audience_children({}, o),
		m.hero_audience_adults({}, o),
		m.hero_audience_seniors({}, o),
	];
	return (
		<section class="hero -mt-20 overflow-hidden">
			<div class="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-44 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
				<div>
					<p class="hero-in text-overline uppercase tracking-[0.14em] text-ink-muted" style="--i:0">
						{m.hero_overline({}, o)}
					</p>
					<h1 class="display mt-6 text-display-xl text-ink">
						{words.map((w, i) => (
							<>
								<span class="hero-word" style={`--i:${i + 1}`}>
									{w}
								</span>{" "}
							</>
						))}
					</h1>
					<p
						class="hero-in mt-8 max-w-xl text-body-lg text-ink-muted"
						style={`--i:${words.length + 1}`}
					>
						{m.hero_lead({}, o)}
					</p>
					<div
						class="hero-in mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
						style={`--i:${words.length + 2}`}
					>
						<Button size="lg" href={`${b}/contact`}>
							{m.hero_cta_book({}, o)}
						</Button>
						<Button size="lg" variant="outline" href={`${b}/#pentru-cine`}>
							{m.hero_cta_services({}, o)}
						</Button>
					</div>
					<p class="hero-in mt-8 text-body text-ink-muted" style={`--i:${words.length + 3}`}>
						{`${m.hero_call({}, o)} `}
						<a class="font-semibold text-glow-1 hover:underline" href={`tel:${phone.tel}`}>
							{phone.display}
						</a>
					</p>
				</div>
				<div class="hero-visual">
					<span class="hero-visual__layer hero-visual__layer--far" aria-hidden="true">
						<span class="hero-visual__disc" />
						<span class="hero-visual__emblem" />
						<span class="hero-visual__ring hero-visual__ring--outer">
							<span class="hero-visual__dot hero-visual__dot--gold" />
						</span>
						<span class="hero-visual__ring hero-visual__ring--inner">
							<span class="hero-visual__dot hero-visual__dot--teal" />
						</span>
						<span class="hero-visual__bead hero-visual__bead--champagne" />
					</span>
					<div class="hero-visual__layer hero-visual__layer--near">
						<figure class="hero-visual__photo hero-visual__photo--image">
							<Picture {...heroPicture(locale)} imgClass="hero-visual__img" />
						</figure>
						<p class="hero-visual__stat">
							<span class="hero-visual__value" style={`--to:${years}`}>
								<span class="sr-only">{years}</span>
								<span class="hero-visual__count" aria-hidden="true" />
							</span>
							<span class="hero-visual__label">{m.hero_stat_label({}, o)}</span>
						</p>
					</div>
				</div>
				<div class="hero-facts lg:col-span-2">
					<ul class="hero-facts__group" aria-label={m.hero_audience_label({}, o)}>
						{audience.map((label, i) => (
							<li class="hero-fact hero-fact--pill" style={`--i:${i}`}>
								{label}
							</li>
						))}
					</ul>
					<ul class="hero-facts__group">
						<li class="hero-fact" style="--i:3">
							{m.hero_fact_first({}, o)}
						</li>
						<li class="hero-fact hero-fact--teal" style="--i:4">
							{m.hero_fact_method({}, o)}
						</li>
					</ul>
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
						suggestions={guideCopy(locale).chips}
					/>
					<div id="guide-answer" class="mt-4" aria-live="polite">
						<GuideMessage>{guideCopy(locale).welcome}</GuideMessage>
					</div>
				</div>
				<p class="mt-6 text-body-sm text-ink-muted">{m.hero_reassure({}, o)}</p>
			</div>
		</section>
	);
}
