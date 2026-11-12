import { faqPageJsonLd, type JsonLdNode } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { dateLabel, EDITIONS, type Edition, editionsOf, isoRange } from "../content/editions";
import { ESTATE } from "../estate";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href, type PAGES, WORKSHOP_IDS, type WorkshopId, workshopHref } from "../routes";
import { FromTheBlog } from "../sections/blog";
import { eventJsonLd } from "../seo";
import { DocSections, FaqBlock, faqPlain, head, plain, seo, Toc, text } from "./doc";
import { NextSteps, PageHero, type PageProps, PageShell } from "./shell";

type NextLink = { label: string; href: string; primary?: boolean };

/** A page whose body is entirely its content sections: head, table of contents, sections, blog, next steps. */
function ContentShell({
	props,
	page,
	id,
	toc = true,
	next,
	jsonLd,
	children,
	extra,
}: {
	props: PageProps;
	page: string;
	id: keyof typeof PAGES;
	toc?: boolean;
	next: ReadonlyArray<NextLink>;
	jsonLd?: ReadonlyArray<JsonLdNode>;
	children?: JSX.Element | null;
	extra?: JSX.Element | null;
}): JSX.Element {
	const { locale } = props;
	const h = head(page, locale);
	const other = locale === "ro" ? "en" : "ro";
	return (
		<PageShell
			{...props}
			otherHref={href(other, id)}
			title={h.h1}
			seoTitle={h.seoTitle}
			description={h.description}
			jsonLd={jsonLd}
		>
			<PageHero locale={locale} overline={h.overline} title={h.h1} lead={h.lead}>
				{toc ? <Toc page={page} locale={locale} /> : null}
			</PageHero>
			{extra ?? null}
			<DocSections page={page} locale={locale} />
			{children ?? null}
			<FromTheBlog locale={locale} />
			<NextSteps links={next} />
		</PageShell>
	);
}

/** One illustration of the old site, with a caption of its provenance. */
function OldFigure({
	file,
	width,
	height,
	alt,
	caption,
}: {
	file: string;
	width: number;
	height: number;
	alt: string;
	caption?: string;
}): JSX.Element {
	return (
		<figure class="mx-auto max-w-4xl px-6 pt-14 md:px-14">
			<img
				src={`/images/old-site/${file}`}
				width={width}
				height={height}
				alt={alt}
				loading="lazy"
				decoding="async"
				class="h-auto w-full rounded-[20px]"
			/>
			{caption ? <figcaption class="mt-3 text-body-sm text-ink-faint">{caption}</figcaption> : null}
		</figure>
	);
}

export function HistoryPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	return (
		<ContentShell
			props={props}
			page="hist"
			id="history"
			next={[
				{ label: m.next_start({}, o), href: href(locale, "start"), primary: true },
				{ label: m.next_tech({}, o), href: href(locale, "technology") },
				{ label: m.next_glossary({}, o), href: href(locale, "glossary") },
			]}
		/>
	);
}

export function GlossaryPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	return (
		<ContentShell
			props={props}
			page="gloss"
			id="glossary"
			toc={false}
			next={[
				{ label: m.next_start({}, o), href: href(locale, "start"), primary: true },
				{ label: m.next_focus({}, o), href: href(locale, "focus") },
				{ label: m.next_faq({}, o), href: href(locale, "faq") },
			]}
		/>
	);
}

export function StartPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	return (
		<ContentShell
			props={props}
			page="start"
			id="start"
			next={[
				{ label: m.next_exercises({}, o), href: href(locale, "exercises"), primary: true },
				{ label: m.next_meditation({}, o), href: href(locale, "meditation") },
				{ label: m.next_faq({}, o), href: href(locale, "faq") },
			]}
		/>
	);
}

export function MeditationPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	return (
		<ContentShell
			props={props}
			page="med"
			id="meditation"
			toc={false}
			next={[
				{ label: m.next_exercises({}, o), href: href(locale, "exercises"), primary: true },
				{ label: m.next_start({}, o), href: href(locale, "start") },
				{ label: m.next_focus({}, o), href: href(locale, "focus") },
			]}
		/>
	);
}

/** The edition rows of one archive list. */
function EditionList({
	locale,
	editions,
	withType,
}: {
	locale: Locale;
	editions: ReadonlyArray<Edition>;
	withType: boolean;
}): JSX.Element {
	const o = at(locale);
	return (
		<ul class="divide-y divide-line border-y border-line">
			{editions.map((e) => (
				<li class="space-y-1 py-5">
					<p class="text-body-lg text-ink">
						{dateLabel(e, locale)}
						{" · "}
						{e.online ? m.arch_online({}, o) : (e.place ?? m.arch_in_person({}, o))}
					</p>
					{withType ? (
						<p class="text-body text-ink-muted">
							<a class="text-link" href={workshopHref(locale, e.type)}>
								{text(`${PREFIX[e.type]}_h1`, locale)}
							</a>
						</p>
					) : null}
					{e.year === null ? (
						<p class="text-body-sm text-ink-faint">{m.arch_year_unknown({}, o)}</p>
					) : null}
				</li>
			))}
		</ul>
	);
}

/** Message prefix of each workshop type's content. */
const PREFIX: Readonly<Record<WorkshopId, string>> = {
	consciousness: "wcons",
	advanced: "wadv",
	optimise: "wopt",
	creative: "wcre",
	connection: "wcon",
	obe: "wobe",
	online: "wonl",
};

/** An `Event` for each edition whose year is confirmed. */
function eventNodes(locale: Locale, editions: ReadonlyArray<Edition>): ReadonlyArray<JsonLdNode> {
	return editions.flatMap((e) => {
		const range = isoRange(e);
		if (range === null) return [];
		const name = text(`${PREFIX[e.type]}_h1`, locale);
		return [
			eventJsonLd({
				name: e.place === undefined ? name : `${name}, ${e.place}`,
				description: plain(text(`${PREFIX[e.type]}_seo_desc`, locale)),
				startDate: range.start,
				endDate: range.end,
				city: e.place,
				online: e.online === true,
				url: `${ESTATE.hemisync}${workshopHref(locale, e.type)}`,
				inLanguage: locale === "ro" ? "ro" : "en",
			}),
		];
	});
}

/** /programe/arhiva: every past edition, grouped by workshop type, and the shared workshop questions. */
export function ArchivePage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const h = head("archive", locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "archive")}
			title={h.h1}
			seoTitle={h.seoTitle}
			description={h.description}
			jsonLd={[faqPageJsonLd(faqPlain("wsfaq", locale)), ...eventNodes(locale, EDITIONS)]}
		>
			<PageHero locale={locale} overline={h.overline} title={h.h1} lead={h.lead} />
			<DocSections page="archive" locale={locale} />
			<section class="mx-auto max-w-7xl px-6 py-16 md:px-14 md:py-24">
				<h2 class="display text-display-md text-ink">{m.arch_editions_h({}, o)}</h2>
				<div class="mt-10 max-w-3xl">
					<EditionList locale={locale} editions={editionsOf()} withType />
					<p class="mt-6 text-body-sm text-ink-faint">{m.arch_facilitator({}, o)}</p>
				</div>
			</section>
			<div class="mx-auto max-w-7xl space-y-20 px-6 pb-24 md:px-14">
				<FaqBlock page="wsfaq" locale={locale} />
			</div>
			<FromTheBlog locale={locale} />
			<NextSteps
				links={[
					{ label: m.next_programmes({}, o), href: href(locale, "programmes"), primary: true },
					{ label: m.next_exercises({}, o), href: href(locale, "exercises") },
					{ label: m.next_faq({}, o), href: href(locale, "faq") },
				]}
			/>
		</PageShell>
	);
}

/** One workshop type's page: what it is, its editions, the shared questions. */
export function WorkshopPage(props: PageProps & { id: WorkshopId }): JSX.Element {
	const { locale, id } = props;
	const o = at(locale);
	const page = PREFIX[id];
	const h = {
		...seo(page, locale),
		h1: text(`${page}_h1`, locale),
		lead: text(`${page}_lead`, locale),
	};
	const other = locale === "ro" ? "en" : "ro";
	const editions = editionsOf(id);
	const sibling = WORKSHOP_IDS.filter((w) => w !== id);
	return (
		<PageShell
			{...props}
			otherHref={workshopHref(other, id)}
			title={h.h1}
			seoTitle={h.seoTitle}
			description={h.description}
			jsonLd={eventNodes(locale, editions)}
		>
			<PageHero locale={locale} overline={m.ws_group_label({}, o)} title={h.h1} lead={h.lead}>
				<Toc page={page} locale={locale} />
			</PageHero>
			{id === "optimise" ? (
				<OldFigure
					file="optimise-your-life-galati-2023.webp"
					width={829}
					height={534}
					alt={m.arch_poster_optimise({}, o)}
				/>
			) : null}
			{id === "online" ? (
				<>
					<OldFigure
						file="online-workshop-2025.webp"
						width={1024}
						height={637}
						alt={m.arch_poster_online({}, o)}
					/>
					<OldFigure
						file="seven-meditations.webp"
						width={1536}
						height={955}
						alt={m.arch_poster_seven({}, o)}
					/>
				</>
			) : null}
			<DocSections page={page} locale={locale} />
			<section id="arhiva" class="mx-auto max-w-7xl scroll-mt-8 px-6 py-16 md:px-14 md:py-24">
				<h2 class="display text-display-md text-ink">{m.arch_editions_h({}, o)}</h2>
				<div class="mt-10 max-w-3xl">
					{editions.length === 0 ? (
						<p class="text-body-lg text-ink-muted">{m.arch_empty({}, o)}</p>
					) : (
						<>
							<EditionList locale={locale} editions={editions} withType={false} />
							<p class="mt-6 text-body-sm text-ink-faint">{m.arch_facilitator({}, o)}</p>
						</>
					)}
				</div>
			</section>
			<section class="hs-wash">
				<div class="mx-auto max-w-7xl space-y-6 px-6 py-16 md:px-14 md:py-24">
					<h2 class="display text-display-md text-ink">{text("ws_register_h", locale)}</h2>
					<p class="max-w-2xl text-body-lg text-ink-muted">{text("ws_register_p", locale)}</p>
				</div>
			</section>
			<div class="mx-auto max-w-7xl space-y-20 px-6 py-16 md:px-14 md:py-24">
				<FaqBlock page="wsfaq" locale={locale} />
				<p class="max-w-2xl text-body text-ink-muted">
					{sibling.map((w, i) => (
						<>
							{i > 0 ? " · " : null}
							<a class="text-link" href={workshopHref(locale, w)}>
								{text(`${PREFIX[w]}_h1`, locale)}
							</a>
						</>
					))}
				</p>
			</div>
			<FromTheBlog locale={locale} />
			<NextSteps
				links={[
					{ label: m.next_workshops({}, o), href: href(locale, "archive"), primary: true },
					{ label: m.next_programmes({}, o), href: href(locale, "programmes") },
					{ label: m.next_start({}, o), href: href(locale, "start") },
				]}
			/>
		</PageShell>
	);
}
