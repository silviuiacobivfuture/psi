import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href, type ProgrammeSlug } from "../routes";
import { programmeHref } from "../sections/programmes";
import { FocusLevels } from "./focus";
import { ProgrammeArches, programmeCards } from "./programmes";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/**
 * /programe/<slug>: one programme. Gateway Voyage® explores the Focus levels the home already
 * names; format, venue, facilitator, dates and terms stay placeholders until the owner confirms
 * them (docs/plans/hemisync-web.md §4, question 8).
 */
export function ProgrammePage(props: PageProps & { slug: ProgrammeSlug }): JSX.Element {
	const { locale, slug } = props;
	const o = at(locale);
	const cards = programmeCards(locale);
	const card = cards.find((c) => c.slug === slug);
	const others = cards.filter((c) => c.slug !== slug);
	const title = card?.title ?? m.nav_programmes({}, o);
	return (
		<PageShell
			{...props}
			otherHref={programmeHref(locale === "ro" ? "en" : "ro", slug)}
			title={title}
			description={card?.text ?? m.meta_description({}, o)}
		>
			<PageHero locale={locale} overline={card?.eyebrow ?? ""} title={title} lead={card?.text} />
			<Band overline={m.pr_explore_overline({}, o)} title={m.pr_explore_title({}, o)}>
				{slug === "gateway-voyage" ? (
					<>
						<Para>{m.fo_map_gateway({}, o)}</Para>
						<FocusLevels locale={locale} />
					</>
				) : (
					<Pending locale={locale}>{m.pr_explore_pending({}, o)}</Pending>
				)}
			</Band>
			<Band overline={m.nav_sessions({}, o)} title={m.pr_format_title({}, o)} wash>
				<Para>{m.pg_request({}, o)}</Para>
				<Pending locale={locale}>{m.pr_format_pending({}, o)}</Pending>
			</Band>
			<section class="mx-auto max-w-7xl px-6 py-20 md:px-14 md:py-28">
				<p class="hs-overline">{m.pr_related({}, o)}</p>
				<div class="mt-12">
					<ProgrammeArches locale={locale} cards={others} idPrefix="rel" />
				</div>
			</section>
			<NextSteps
				links={[
					{ label: m.nav_exercises({}, o), href: href(locale, "exercises"), primary: true },
					{ label: m.programmes_all({}, o), href: href(locale, "programmes") },
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}
