import type { Article } from "@psi/content";
import { ArticleCover, Button, ReadingProgress, StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { SITES } from "../brands";
import { EDITORIAL_POLICY } from "../content/editorial-policy";
import { brandName, topicHub, topicLabel } from "../content/topics";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import { ArticleBody } from "../sections/article-body";
import { Byline, overline } from "../sections/article-meta";
import { DraftNotice } from "../sections/draft-notice";
import { Footer } from "../sections/footer";
import { GuidePanel } from "../sections/guide-panel";
import { Header } from "../sections/header";
import { Related } from "../sections/related";
import type { Theme } from "../theme";

/** The one next step: the topic's hub on the brand's site when it is live, else the site itself. */
function nextStep(a: Article, locale: Locale): { label: string; href: string } {
	const o = at(locale);
	const brand = brandName(a.brand, locale);
	const hub = topicHub(a.topic);
	// The brand sites serve English under /en, as this blog does.
	const site = `${SITES[a.brand]}${base(locale)}`;
	return hub !== undefined
		? {
				label: m.next_hub({ topic: topicLabel(a.topic, locale), brand }, o),
				href: `${site}${hub}`,
			}
		: { label: m.next_site({ brand }, o), href: site };
}

function InReviewNotice({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<div class="bl-notice">
			<StatusBadge tone="info">{m.status_in_review({}, o)}</StatusBadge>
			<p class="mt-4 text-body-lg text-ink">{m.in_review_note({}, o)}</p>
			<a class="bl-more mt-6" href={routes.article(locale, EDITORIAL_POLICY.slug)}>
				{m.in_review_policy({}, o)}
				<span aria-hidden="true">→</span>
			</a>
		</div>
	);
}

export function ArticlePage({
	article: a,
	locale,
	theme,
	origin,
}: {
	article: Article;
	locale: Locale;
	theme: Theme;
	origin: string;
}): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const isPublished = a.status === "published";
	const standfirst =
		a.status === "in-review" ? m.in_review_standfirst({}, o) : a.standfirst[locale];
	const next = nextStep(a, locale);
	const brand = brandName(a.brand, locale);
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${a.title[locale]} — ${m.masthead_title({}, o)}`}
			description={standfirst}
			canonical={`${origin}${routes.article(locale, a.slug)}`}
			alternate={{ locale: other, href: `${origin}${routes.article(other, a.slug)}` }}
			feed={{
				title: m.rss_brand_title({ brand }, o),
				href: `${origin}${routes.brandRss(locale, a.brand)}`,
			}}
			noindex={!isPublished}
			ogType="article"
		>
			{a.status !== "in-review" ? <ReadingProgress /> : null}
			<Header locale={locale} otherHref={routes.article(other, a.slug)} brand={a.brand} />
			<main id="continut">
				<article class="px-4 pt-10 sm:px-6 md:pt-16">
					<header class="mx-auto max-w-[680px]">
						<p class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
							<a class="bl-back" href={`${routes.home(locale)}#articole`}>
								<span aria-hidden="true">←</span>
								{m.article_back({}, o)}
							</a>
							<a class="bl-back" href={`${SITES[a.brand]}${base(locale)}`}>
								{m.article_brand_site({ brand }, o)}
								<span aria-hidden="true">↗</span>
							</a>
						</p>
						<p class="bl-overline mt-12 md:mt-16">{overline(a, locale)}</p>
						<h1 class="bl-h1 mt-5">{a.title[locale]}</h1>
						<p
							class={
								a.status === "in-review"
									? "bl-standfirst bl-standfirst--pending mt-7"
									: "bl-standfirst mt-7"
							}
						>
							{standfirst}
						</p>
						<Byline article={a} locale={locale} />
					</header>
					{a.status !== "in-review" ? (
						<>
							{a.status === "draft" ? (
								<div class="mx-auto mt-10 max-w-[680px]">
									<DraftNotice article={a} locale={locale} />
								</div>
							) : null}
							<div class="mx-auto mt-12 max-w-[880px]">
								<ArticleCover hue={1}>
									<span class="bl-cover-mark">¶</span>
								</ArticleCover>
							</div>
							<div class="mt-14">
								<ArticleBody article={a} locale={locale} />
							</div>
						</>
					) : (
						<div class="mx-auto mt-12 max-w-[680px]">
							<InReviewNotice locale={locale} />
						</div>
					)}
				</article>

				<aside class="mx-auto mt-20 max-w-[680px] px-4 sm:px-0" aria-labelledby="ghid-articol">
					<div class="bl-rule-strong pt-8">
						<h2 id="ghid-articol" class="bl-section-title">
							{m.article_guide_title({}, o)}
						</h2>
						<div class="mt-8">
							<GuidePanel
								locale={locale}
								placeholder={m.article_ask_placeholder({}, o)}
								intro={m.article_guide_intro({}, o)}
							/>
						</div>
					</div>
					<div class="mt-14 border-t border-line-strong pt-8">
						<p class="bl-overline">{m.next_overline({}, o)}</p>
						<div class="mt-5">
							<Button arrow href={next.href}>
								{next.label}
							</Button>
						</div>
					</div>
					<Related article={a} locale={locale} />
				</aside>
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
