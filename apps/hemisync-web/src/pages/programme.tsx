import { OfferingPrices } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { prices } from "../cms";
import { at } from "../i18n";
import type { SectionPhoto } from "../imagery";
import { m } from "../paraglide/messages.js";
import { bookingHref, href, type ProgrammeSlug } from "../routes";
import { FromTheBlog } from "../sections/blog";
import { programmeHref } from "../sections/programmes";
import { DocSections, seo } from "./doc";
import { FocusLevels } from "./focus";
import { ProgrammeArches, programmeCards } from "./programmes";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/** Message prefix of each programme's content. */
const PAGE: Readonly<Record<ProgrammeSlug, string>> = {
	"gateway-voyage": "pgv",
	"sync-creation": "psc",
	"lucid-dreaming": "pld",
};

/** The photograph under one section of each programme page. */
const PHOTOS: Readonly<Record<ProgrammeSlug, Readonly<Record<string, SectionPhoto>>>> = {
	"gateway-voyage": { s03: "valleyMist" },
	"sync-creation": { s02: "cloudHill" },
	"lucid-dreaming": { s02: "frostFirs" },
};

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
	const page = PAGE[slug];
	const s = seo(page, locale);
	return (
		<PageShell
			{...props}
			otherHref={programmeHref(locale === "ro" ? "en" : "ro", slug)}
			title={title}
			seoTitle={s.seoTitle}
			description={s.description}
		>
			<PageHero locale={locale} overline={card?.eyebrow ?? ""} title={title} lead={card?.text} />
			<DocSections page={page} locale={locale} wash={false} photos={PHOTOS[slug]} />
			{slug === "gateway-voyage" ? (
				<Band overline={m.pr_explore_overline({}, o)} title={m.pr_explore_title({}, o)}>
					<FocusLevels locale={locale} />
				</Band>
			) : null}
			<Band overline={m.nav_sessions({}, o)} title={m.pr_format_title({}, o)} wash>
				<Para>{m.pg_request({}, o)}</Para>
				<OfferingPrices class="mt-8" items={prices(locale, [slug])} />
				<Pending locale={locale}>{m.pr_format_pending({}, o)}</Pending>
			</Band>
			<section class="mx-auto max-w-7xl px-6 py-20 md:px-14 md:py-28">
				<p class="hs-overline">{m.pr_related({}, o)}</p>
				<div class="mt-12">
					<ProgrammeArches locale={locale} cards={others} idPrefix="rel" />
				</div>
			</section>
			<FromTheBlog locale={locale} />
			<NextSteps
				links={[
					{ label: m.nav_exercises({}, o), href: href(locale, "exercises"), primary: true },
					{ label: m.bk_nav({}, o), href: bookingHref(locale) },
					{ label: m.programmes_all({}, o), href: href(locale, "programmes") },
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}
