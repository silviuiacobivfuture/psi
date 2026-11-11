import { ArticleList, ArticleListRow, FilterChips } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { type BlogBrand, BRANDS } from "../brands";
import { type ArticleFilter, inProgress, published } from "../content/articles";
import type { Topic } from "../content/schema";
import { brandName, topicLabel } from "../content/topics";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import { overline, RowMeta } from "../sections/article-meta";
import { Featured } from "../sections/featured";
import { Footer } from "../sections/footer";
import { GuidePanel } from "../sections/guide-panel";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

function filterHref(locale: Locale, brand?: BlogBrand): string {
	return `${routes.home(locale)}${brand === undefined ? "" : `?brand=${brand}`}#articole`;
}

export function IndexPage({
	locale,
	theme,
	origin,
	brand,
	topic,
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
	brand?: BlogBrand;
	topic?: Topic;
}): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const filter: ArticleFilter = { brand, topic };
	const [featured, ...rest] = published(filter);
	const coming = [...rest, ...inProgress(filter)];
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
				<section class="mx-auto max-w-[1200px] px-4 pb-20 pt-20 sm:px-6 md:pb-28 md:pt-32">
					<p class="bl-overline">{m.hero_overline({}, o)}</p>
					<h1 class="bl-hero-title mt-6 md:mt-8">{m.hero_title({}, o)}</h1>
					<p class="mt-6 max-w-xl text-body-lg text-ink-muted md:mt-8">{m.hero_lead({}, o)}</p>
					<div class="mt-10 max-w-[720px] md:mt-12">
						<GuidePanel
							locale={locale}
							placeholder={m.ask_placeholder({}, o)}
							intro={m.guide_intro({}, o)}
							suggestions={[m.ask_suggest_1({}, o), m.ask_suggest_2({}, o), m.ask_suggest_3({}, o)]}
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
									href: filterHref(locale),
									current: brand === undefined,
								},
								...BRANDS.map((b) => ({
									label: brandName(b, locale),
									href: filterHref(locale, b),
									current: brand === b,
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
								href={filterHref(locale, brand)}
							>
								{m.topic_filter_clear({}, o)}
							</a>
						</p>
					) : null}

					{featured !== undefined ? (
						<div class="mt-10 md:mt-14">
							<Featured article={featured} locale={locale} />
						</div>
					) : null}

					{coming.length > 0 ? (
						<div class="mt-20 md:mt-28">
							<div class="mb-8 grid gap-3 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
								<h2 class="bl-overline pt-1">{m.coming_title({}, o)}</h2>
								<p class="max-w-xl text-body text-ink-muted">{m.coming_text({}, o)}</p>
							</div>
							<ArticleList>
								{coming.map((a) => (
									<ArticleListRow
										href={routes.article(locale, a.slug)}
										title={a.title[locale]}
										overline={overline(a, locale)}
										standfirst={
											a.status === "published" ? a.standfirst[locale] : m.in_review_row({}, o)
										}
										meta={<RowMeta article={a} locale={locale} />}
									/>
								))}
							</ArticleList>
						</div>
					) : null}

					{featured === undefined && coming.length === 0 ? (
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
