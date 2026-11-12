import { ArchCard, OfferingPrices } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { prices } from "../cms";
import { at, type Locale } from "../i18n";
import { programmePicture } from "../imagery";
import { m } from "../paraglide/messages.js";
import {
	href,
	PROGRAMME_SLUGS,
	type ProgrammeSlug,
	type WorkshopId,
	workshopHref,
} from "../routes";
import { FromTheBlog } from "../sections/blog";
import { programmeHref } from "../sections/programmes";
import { DocSections, seo } from "./doc";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/** One programme's card text, from the home's own copy. */
export interface ProgrammeCard {
	slug: ProgrammeSlug;
	hue: 1 | 2 | 3;
	eyebrow: string;
	title: string;
	text: string;
}

export function programmeCards(locale: Locale): ReadonlyArray<ProgrammeCard> {
	const o = at(locale);
	const cards: Readonly<Record<ProgrammeSlug, Omit<ProgrammeCard, "slug">>> = {
		"gateway-voyage": {
			hue: 1,
			eyebrow: m.gateway_eyebrow({}, o),
			title: m.gateway_title({}, o),
			text: m.gateway_text({}, o),
		},
		"sync-creation": {
			hue: 2,
			eyebrow: m.synccreation_eyebrow({}, o),
			title: m.synccreation_title({}, o),
			text: m.synccreation_text({}, o),
		},
		"lucid-dreaming": {
			hue: 3,
			eyebrow: m.lucid_eyebrow({}, o),
			title: m.lucid_title({}, o),
			text: m.lucid_text({}, o),
		},
	};
	return PROGRAMME_SLUGS.map((slug) => ({ slug, ...cards[slug] }));
}

/** The arches of the given programmes, linking to their pages. */
export function ProgrammeArches({
	locale,
	cards,
	idPrefix,
}: {
	locale: Locale;
	cards: ReadonlyArray<ProgrammeCard>;
	idPrefix: string;
}): JSX.Element {
	return (
		<div class="grid gap-12 sm:grid-cols-2 md:gap-10 lg:grid-cols-3">
			{cards.map((c) => (
				<ArchCard
					id={`${idPrefix}-${c.slug}`}
					hue={c.hue}
					eyebrow={c.eyebrow}
					title={c.title}
					text={c.text}
					more={m.programme_more({}, at(locale))}
					href={programmeHref(locale, c.slug)}
					picture={programmePicture(locale, c.slug)}
				/>
			))}
		</div>
	);
}

/**
 * /programe: the programmes, the scheduled sessions (one events model, docs/plans/hemisync-web.md
 * §2) and the workshop types named in the plan. Dates, prices and descriptions wait for the owner.
 */
export function ProgrammesPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const workshops: ReadonlyArray<{ id: WorkshopId; label: string }> = [
		{ id: "consciousness", label: m.ws_1({}, o) },
		{ id: "advanced", label: m.ws_2({}, o) },
		{ id: "creative", label: m.ws_3({}, o) },
		{ id: "connection", label: m.ws_4({}, o) },
		{ id: "optimise", label: m.ws_5({}, o) },
		{ id: "obe", label: m.ws_6({}, o) },
		{ id: "online", label: m.ws_7({}, o) },
	];
	const s = seo("progs", locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "programmes")}
			title={m.nav_programmes({}, o)}
			seoTitle={s.seoTitle}
			description={s.description}
		>
			<PageHero
				locale={locale}
				overline={m.programmes_overline({}, o)}
				title={m.pg_title({}, o)}
				lead={m.footer_tagline({}, o)}
			/>
			<section class="mx-auto max-w-7xl px-6 py-20 md:px-14 md:py-28">
				<ProgrammeArches locale={locale} cards={programmeCards(locale)} idPrefix="pg" />
			</section>
			<DocSections page="progs" locale={locale} wash={false} />
			<Band id="sesiuni" overline={m.nav_sessions({}, o)} title={m.pg_sessions_title({}, o)} wash>
				<Para>{m.pg_request({}, o)}</Para>
				<OfferingPrices class="mt-8" items={prices(locale, PROGRAMME_SLUGS)} />
				<Pending locale={locale}>{m.pg_sessions_pending({}, o)}</Pending>
			</Band>
			<Band
				id="ateliere"
				overline={m.pg_workshops_overline({}, o)}
				title={m.pg_workshops_title({}, o)}
			>
				<ul class="divide-y divide-line border-y border-line">
					{workshops.map((w) => (
						<li class="py-4 text-body-lg">
							<a class="text-link" href={workshopHref(locale, w.id)}>
								{w.label}
							</a>
						</li>
					))}
				</ul>
				<a class="pz-tap text-link text-body" href={href(locale, "archive")}>
					{m.arch_all({}, o)}
				</a>
			</Band>
			<Band overline={m.group_free({}, o)} title={m.pg_start_title({}, o)} wash>
				<Para>{m.pg_start_text({}, o)}</Para>
			</Band>
			<FromTheBlog locale={locale} />
			<NextSteps
				links={[
					{ label: m.next_start({}, o), href: href(locale, "start"), primary: true },
					{ label: m.gateway_title({}, o), href: programmeHref(locale, "gateway-voyage") },
					{ label: m.next_workshops({}, o), href: href(locale, "archive") },
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}
