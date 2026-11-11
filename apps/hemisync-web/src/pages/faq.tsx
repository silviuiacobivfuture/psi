import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { NextSteps, PageHero, type PageProps, PageShell, Pending } from "./shell";

interface Group {
	id: string;
	title: string;
	items: ReadonlyArray<{ q: string; a: string }>;
	note?: string;
}

/**
 * /intrebari-frecvente: answers built only from what the site already states. The live page's
 * 46 questions move here after review; safety notes wait for clinical review.
 */
export function FaqPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const groups: ReadonlyArray<Group> = [
		{
			id: "inceput",
			title: m.hf_group_start({}, o),
			items: [
				{ q: m.ask_suggest_1({}, o), a: m.hq_start_a({}, o) },
				{ q: m.ask_suggest_3({}, o), a: m.tech_headphones({}, o) },
				{ q: m.hq_belief_q({}, o), a: m.hq_belief_a({}, o) },
			],
		},
		{
			id: "programe",
			title: m.nav_programmes({}, o),
			items: [
				{ q: m.hq_language_q({}, o), a: m.hq_language_a({}, o) },
				{ q: m.hq_request_q({}, o), a: m.pg_request({}, o) },
				{ q: m.hq_venue_q({}, o), a: m.hq_venue_a({}, o) },
			],
		},
		{
			id: "focus",
			title: m.nav_focus({}, o),
			items: [
				{ q: m.ask_suggest_2({}, o), a: m.focus_lead({}, o) },
				{ q: m.hq_ladder_q({}, o), a: m.hq_ladder_a({}, o) },
			],
		},
		{
			id: "siguranta",
			title: m.hf_group_safety({}, o),
			items: [{ q: m.hq_therapy_q({}, o), a: m.hq_therapy_a({}, o) }],
			note: m.hf_safety_pending({}, o),
		},
	];
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "faq")}
			title={m.nav_faq({}, o)}
			description={m.hf_lead({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.nav_faq({}, o)}
				title={m.hf_title({}, o)}
				lead={m.hf_lead({}, o)}
			/>
			<div class="mx-auto max-w-7xl space-y-20 px-6 py-20 md:px-14 md:py-28">
				{groups.map((g) => (
					<section id={g.id} class="grid scroll-mt-8 gap-8 lg:grid-cols-[5fr_7fr]">
						<h2 class="display text-display-md text-ink">{g.title}</h2>
						<div class="space-y-6">
							<div class="divide-y divide-line border-y border-line">
								{g.items.map((it) => (
									<details class="group py-2">
										<summary class="flex cursor-pointer list-none items-baseline justify-between gap-6 py-4 text-body-lg text-ink">
											{it.q}
											<svg
												class="shrink-0 text-glow-1 transition-transform group-open:rotate-45"
												width="14"
												height="14"
												viewBox="0 0 14 14"
												fill="none"
												stroke="currentColor"
												stroke-width="1.5"
												aria-hidden="true"
											>
												<path d="M7 1v12M1 7h12" />
											</svg>
										</summary>
										<p class="max-w-2xl pb-5 text-body text-ink-muted">{it.a}</p>
									</details>
								))}
							</div>
							{g.note ? <Pending locale={locale}>{g.note}</Pending> : null}
						</div>
					</section>
				))}
				<Pending locale={locale}>{m.hf_pending({}, o)}</Pending>
			</div>
			<NextSteps
				links={[
					{ label: m.nav_guide({}, o), href: `${base(locale)}/#ghid`, primary: true },
					{ label: m.nav_contact({}, o), href: href(locale, "contact") },
				]}
			/>
		</PageShell>
	);
}
