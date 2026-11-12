import { type Article, articleDate } from "@psi/content";
import {
	ArticleCover,
	articleJsonLd,
	Button,
	faqPageJsonLd,
	type JsonLdNode,
	ReadingProgress,
	StatusBadge,
} from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { PreviewReload, ReadingBeacon } from "../analytics/beacon";
import { SITES } from "../brands";
import { EDITORIAL_POLICY } from "../content/editorial-policy";
import { brandName, topicHub, topicLabel } from "../content/topics";
import { coverView } from "../covers";
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

/** The article and its questions as schema.org data (nothing for a backlog title). */
function structuredData(a: Article, locale: Locale, url: string, origin: string): JsonLdNode[] {
	if (a.status === "in-review") return [];
	const health = a.kind === "health";
	const node = articleJsonLd({
		type: health ? "MedicalWebPage" : "BlogPosting",
		headline: a.title[locale],
		description: a.seo?.description[locale] ?? a.standfirst[locale],
		url,
		inLanguage: locale,
		datePublished: articleDate(a),
		keywords: a.seo?.keywords[locale],
		image: a.cover?.src,
		publisher: { name: m.masthead_title({}, at(locale)), url: `${origin}${routes.home(locale)}` },
		author:
			a.status === "published"
				? "team" in a.author
					? { name: a.author.team[locale], type: "Organization" }
					: { name: a.author.name, type: "Person" }
				: undefined,
		reviewedBy:
			a.status === "published" && a.kind === "health"
				? { name: a.reviewer.name, reviewedAt: a.reviewer.reviewedAt }
				: undefined,
		about: topicLabel(a.topic, locale),
	});
	return a.faq.length > 0
		? [node, faqPageJsonLd(a.faq.map((f) => ({ question: f.q[locale], answer: f.a[locale] })))]
		: [node];
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
	beacon = false,
	previewFrom,
}: {
	article: Article;
	locale: Locale;
	theme: Theme;
	origin: string;
	/** Count this reading (first-party, cookieless; false for DNT/GPC and in the preview). */
	beacon?: boolean;
	/** In the CMS's live preview: the CMS origin whose saves reload this page. */
	previewFrom?: string;
}): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const isPublished = a.status === "published";
	const standfirst =
		a.status === "in-review" ? m.in_review_standfirst({}, o) : a.standfirst[locale];
	const next = nextStep(a, locale);
	const brand = brandName(a.brand, locale);
	const canonical = `${origin}${routes.article(locale, a.slug)}`;
	const seo = a.status === "in-review" ? null : a.seo;
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={seo?.title[locale] ?? `${a.title[locale]} — ${m.masthead_title({}, o)}`}
			description={seo?.description[locale] ?? standfirst}
			keywords={seo?.keywords[locale]}
			jsonLd={structuredData(a, locale, canonical, origin)}
			canonical={canonical}
			alternate={{ locale: other, href: `${origin}${routes.article(other, a.slug)}` }}
			feed={{
				title: m.rss_brand_title({ brand }, o),
				href: `${origin}${routes.brandRss(locale, a.brand)}`,
			}}
			noindex={!isPublished}
			ogType="article"
		>
			{a.status !== "in-review" ? <ReadingProgress /> : null}
			{beacon && a.status !== "in-review" ? <ReadingBeacon slug={a.slug} locale={locale} /> : null}
			{previewFrom !== undefined ? <PreviewReload cmsOrigin={previewFrom} /> : null}
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
								<ArticleCover
									class="bl-article-cover"
									hue={1}
									{...coverView(a, locale, "article")}
								/>
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
