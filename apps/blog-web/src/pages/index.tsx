import type { Article, Topic } from "@psi/content";
import { FilterChips } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { type BlogBrand, BRANDS } from "../brands";
import { type ArticleFilter, listing } from "../content/articles";
import { SHELF_IDS, type ShelfId, shelfLabel, shelfTopics } from "../content/shelves";
import { brandName, topicLabel } from "../content/topics";
import { guideCopy } from "../guide-copy";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import { Featured } from "../sections/featured";
import { Footer } from "../sections/footer";
import { GuidePanel } from "../sections/guide-panel";
import { Header } from "../sections/header";
import { Pager } from "../sections/pager";
import { StoryGrid } from "../sections/story-card";
import type { Theme } from "../theme";

/** Cards per page of a filtered listing; a shelf on the front page shows a handful. */
export const PAGE_SIZE = 18;
export const SHELF_PREVIEW = 6;

interface View {
	brand?: BlogBrand;
	topic?: Topic;
	shelf?: ShelfId;
	page?: number;
}

function filterHref(locale: Locale, v: View = {}): string {
	const q = new URLSearchParams();
	if (v.brand !== undefined) q.set("brand", v.brand);
	if (v.shelf !== undefined) q.set("shelf", v.shelf);
	if (v.topic !== undefined) q.set("topic", v.topic);
	if (v.page !== undefined && v.page > 1) q.set("page", String(v.page));
	const query = q.toString();
	return `${routes.home(locale)}${query === "" ? "" : `?${query}`}#articole`;
}

/** The front page's shelves: each gathers some topics, newest first, a handful of cards each. */
function Shelves({
	articles,
	locale,
	brand,
}: {
	articles: ReadonlyArray<Article>;
	locale: Locale;
	brand?: BlogBrand;
}): JSX.Element {
	const o = at(locale);
	return (
		<>
			{SHELF_IDS.map((id) => {
				const topics = shelfTopics(id);
				const items = articles.filter((a) => topics.includes(a.topic));
				if (items.length === 0) return null;
				return (
					<section class="bl-shelf" aria-labelledby={`raft-${id}`}>
						<div class="bl-shelf__head">
							<h2 id={`raft-${id}`} class="bl-section-title">
								{shelfLabel(id, locale)}
							</h2>
							{items.length > SHELF_PREVIEW ? (
								<a class="bl-more" href={filterHref(locale, { brand, shelf: id })}>
									{m.shelf_all({ count: String(items.length) }, o)}
									<span aria-hidden="true">→</span>
								</a>
							) : null}
						</div>
						<StoryGrid articles={items.slice(0, SHELF_PREVIEW)} locale={locale} />
					</section>
				);
			})}
		</>
	);
}

export function IndexPage({
	locale,
	theme,
	origin,
	brand,
	topic,
	shelf,
	page = 1,
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
} & View): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const filter: ArticleFilter = { brand, topic, shelf };
	const filtered = brand !== undefined || topic !== undefined || shelf !== undefined;
	// Drafts are listed only where they may be shown (staging), for the owner to review.
	const all = listing(filter);
	const first = all[0];
	const lead = page === 1 && first?.status === "published" ? first : undefined;
	const rest = all.filter((a) => a !== lead);
	const pages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
	const current = Math.min(page, pages);
	const shown = rest.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
	const view: View = { brand, topic, shelf };
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={m.meta_title({}, o)}
			description={m.meta_description({}, o)}
			canonical={`${origin}${routes.home(locale)}`}
			alternate={{ locale: other, href: `${origin}${routes.home(other)}` }}
			feed={{ title: m.rss_title({}, o), href: `${origin}${routes.rss(locale)}` }}
		>
			<Header locale={locale} otherHref={routes.home(other)} />
			<main id="continut">
				<section class="mx-auto max-w-[1200px] px-4 pb-14 pt-16 sm:px-6 md:pb-20 md:pt-28">
					<p class="bl-overline">{m.hero_overline({}, o)}</p>
					<h1 class="bl-hero-title mt-6 md:mt-8">{m.hero_title({}, o)}</h1>
					<p class="mt-6 max-w-xl text-body-lg text-ink-muted md:mt-8">{m.hero_lead({}, o)}</p>
					<div class="mt-10 max-w-[720px] md:mt-12">
						<GuidePanel
							locale={locale}
							placeholder={m.ask_placeholder({}, o)}
							intro={guideCopy(locale).welcome}
							suggestions={guideCopy(locale).chips}
						/>
					</div>
				</section>

				<section id="articole" class="mx-auto max-w-[1200px] scroll-mt-20 px-4 sm:px-6">
					<div class="bl-rule-strong flex flex-wrap items-end justify-between gap-5 pt-6">
						<h2 class="bl-section-title">{m.list_title({}, o)}</h2>
						<FilterChips
							label={m.filters_label({}, o)}
							items={[
								{
									label: m.filter_all({}, o),
									href: filterHref(locale, { shelf }),
									current: brand === undefined,
								},
								...BRANDS.map((b) => ({
									label: brandName(b, locale),
									href: filterHref(locale, { brand: b, shelf }),
									current: brand === b,
								})),
							]}
						/>
					</div>
					<div class="mt-5">
						<FilterChips
							label={m.shelves_label({}, o)}
							items={[
								{
									label: m.shelf_filter_all({}, o),
									href: filterHref(locale, { brand }),
									current: shelf === undefined,
								},
								...SHELF_IDS.map((id) => ({
									label: shelfLabel(id, locale),
									href: filterHref(locale, { brand, shelf: id }),
									current: shelf === id,
								})),
							]}
						/>
					</div>
					{topic !== undefined ? (
						<p class="bl-meta mt-5">
							<span class="text-ink">
								{m.topic_filter({ topic: topicLabel(topic, locale) }, o)}
							</span>
							<a
								class="underline decoration-line-strong underline-offset-4 hover:text-ink"
								href={filterHref(locale, { brand, shelf })}
							>
								{m.topic_filter_clear({}, o)}
							</a>
						</p>
					) : null}

					{lead !== undefined ? (
						<div class="mt-10 md:mt-14">
							<Featured article={lead} locale={locale} />
						</div>
					) : null}

					{shown.length > 0 ? (
						<div class="bl-shelves">
							{filtered ? (
								<>
									<StoryGrid articles={shown} locale={locale} label={m.list_title({}, o)} />
									<Pager
										page={current}
										pages={pages}
										locale={locale}
										href={(n) => filterHref(locale, { ...view, page: n })}
									/>
								</>
							) : (
								<Shelves articles={rest} locale={locale} brand={brand} />
							)}
						</div>
					) : null}

					{lead === undefined && shown.length === 0 ? (
						<div class="mt-14 max-w-xl border-t border-line-strong py-16">
							<p class="bl-empty-title">
								{
									// U+2011 keeps "EQ-SYNC" and "Hemi-Sync" from breaking at their hyphen.
									m
										.empty_title(
											{
												brand:
													brand !== undefined
														? brandName(brand, locale)
														: topicLabel(topic ?? "editorial", locale),
											},
											o,
										)
										.replace(/-/g, "\u2011")
								}
							</p>
							<p class="mt-4 text-body-lg text-ink-muted">{m.empty_text({}, o)}</p>
							<a class="bl-more mt-8" href={filterHref(locale)}>
								{m.empty_back({}, o)}
								<span aria-hidden="true">→</span>
							</a>
						</div>
					) : null}
				</section>
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
