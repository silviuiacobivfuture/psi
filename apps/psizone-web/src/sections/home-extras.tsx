import { Button } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { FAQ, FAQ_HOME } from "../content/faq";
import { TRUST_MARKS } from "../content/trust";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { FaqList } from "./faq-list";
import { ProgrammeCards } from "./programme-cards";

/** The documented milestones (owners' story), with the way to the whole story. */
export function Trust({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section class="mx-auto max-w-6xl px-5 py-24 md:py-32" aria-labelledby="repere">
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div>
					<p class="text-overline uppercase text-ink-muted">{m.trust_overline({}, o)}</p>
					<h2 id="repere" class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">
						{m.trust_title({}, o)}
					</h2>
				</div>
				<Button variant="glass" arrow href={`${base(locale)}/povestea`}>
					{m.trust_link({}, o)}
				</Button>
			</div>
			<ul class="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
				{TRUST_MARKS.map((t) => (
					<li class="pz-rise flex flex-col gap-3 bg-bg p-6">
						<span class="display text-display-md text-glow-1">{t.value[locale]}</span>
						<span class="text-body text-ink-muted">{t.label[locale]}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

/** Sport psychology and Race Me Up. */
export function Programmes({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="programe" class="border-y border-line bg-surface-1">
			<div class="mx-auto max-w-6xl px-5 py-24 md:py-32">
				<p class="text-overline uppercase text-ink-muted">{m.nav_programmes({}, o)}</p>
				<h2 class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">
					{m.programmes_section_title({}, o)}
				</h2>
				<div class="mt-12">
					<ProgrammeCards locale={locale} />
				</div>
			</div>
		</section>
	);
}

/** Three questions people ask before the first call, and the way to all of them. */
export function FaqTeaser({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const entries = FAQ_HOME.flatMap((id) => FAQ.filter((e) => e.id === id));
	return (
		<section class="mx-auto max-w-6xl px-5 pb-24 md:pb-32">
			<div class="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
				<div>
					<p class="text-overline uppercase text-ink-muted">{m.nav_faq({}, o)}</p>
					<h2 class="display pz-rise mt-4 text-display-lg text-ink">{m.faq_teaser_title({}, o)}</h2>
					<div class="mt-8">
						<Button variant="glass" arrow href={`${base(locale)}/intrebari-frecvente`}>
							{m.faq_all({}, o)}
						</Button>
					</div>
				</div>
				<FaqList locale={locale} entries={entries} />
			</div>
		</section>
	);
}
