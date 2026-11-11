import { StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { NextSteps, PageHero, type PageProps, PageShell, Pending } from "./shell";

/**
 * /disclaimer: safety and contraindications. Every sentence here already exists on the site
 * (FAQ 4 and 5, the footer disclaimer, the 18+ rule from the Terms, the crisis line); nothing new
 * is said about safety until a named clinician reviews the page.
 */
export function SafetyPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const rows = [
		{ q: m.faq_4_q({}, o), a: m.faq_4_a({}, o) },
		{ q: m.faq_5_q({}, o), a: m.faq_5_a({}, o) },
		{ q: m.fq_age_q({}, o), a: m.fq_age_a({}, o) },
		{ q: m.faq_1_q({}, o), a: m.faq_1_a({}, o) },
	];
	return (
		<PageShell
			{...props}
			page="safety"
			title={m.nav_safety({}, o)}
			description={m.footer_disclaimer({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.footer_legal_label({}, o)}
				title={m.nav_safety({}, o)}
				lead={m.footer_disclaimer({}, o)}
			>
				<StatusBadge tone="warning" class="ml-3 mt-8">
					{m.sp_review_badge({}, o)}
				</StatusBadge>
			</PageHero>
			<section class="mx-auto max-w-6xl px-5 py-20 md:py-28">
				<ol class="eq-rows">
					{rows.map((r, i) => (
						<li class="eq-row">
							<span class="eq-row__n">{String(i + 1).padStart(2, "0")}</span>
							<h2 class="eq-row__title">{r.q}</h2>
							<p class="eq-row__text">{r.a}</p>
						</li>
					))}
				</ol>
				<p class="mt-12 max-w-2xl border-l-2 border-line pl-4 text-body text-ink">
					{m.guide_refusal_crisis({}, o)}
				</p>
				<div class="mt-12">
					<Pending locale={locale}>{m.sp_pending({}, o)}</Pending>
				</div>
			</section>
			<NextSteps
				locale={locale}
				links={[
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
					{ label: m.nav_contact({}, o), href: href(locale, "contact") },
				]}
			/>
		</PageShell>
	);
}
