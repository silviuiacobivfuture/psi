import { ArchCard, OfferingPrices } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { prices } from "../cms";
import { at, type Locale } from "../i18n";
import { programmePicture } from "../imagery";
import { m } from "../paraglide/messages.js";
import { href, PROGRAMME_SLUGS, type ProgrammeSlug } from "../routes";
import { programmeHref } from "../sections/programmes";
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
	const workshops = [
		m.ws_1({}, o),
		m.ws_2({}, o),
		m.ws_3({}, o),
		m.ws_4({}, o),
		m.ws_5({}, o),
		m.ws_6({}, o),
		m.ws_7({}, o),
	];
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "programmes")}
			title={m.nav_programmes({}, o)}
			description={m.meta_description({}, o)}
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
						<li class="py-4 text-body-lg text-ink">{w}</li>
					))}
				</ul>
				<Pending locale={locale}>{m.pg_workshops_pending({}, o)}</Pending>
			</Band>
			<Band overline={m.group_free({}, o)} title={m.pg_start_title({}, o)} wash>
				<Para>{m.pg_start_text({}, o)}</Para>
			</Band>
			<NextSteps
				links={[
					{ label: m.nav_exercises({}, o), href: href(locale, "exercises"), primary: true },
					{ label: m.gateway_title({}, o), href: programmeHref(locale, "gateway-voyage") },
					{ label: m.nav_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}
