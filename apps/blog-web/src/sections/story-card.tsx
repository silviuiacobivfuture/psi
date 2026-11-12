import type { Article } from "@psi/content";
import { ArticleCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { readingMinutes } from "../content/articles";
import { coverView } from "../covers";
import { longDate } from "../dates";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import { draftStatus, overline } from "./article-meta";

/** The quiet marker of an article that is not published: a small label, never the loudest thing. */
function statusOf(a: Article, locale: Locale): string | undefined {
	const o = at(locale);
	if (a.status === "draft") return draftStatus(a, locale);
	return a.status === "in-review" ? m.status_in_review({}, o) : undefined;
}

/** "12 noiembrie 2026 · 4 min de citit"; an article still in review has neither yet. */
function metaOf(a: Article, locale: Locale): string | undefined {
	if (a.status === "in-review") return undefined;
	const o = at(locale);
	const date = a.status === "published" ? a.publishedAt : a.draftedAt;
	const minutes = m.reading_time({ minutes: String(readingMinutes(a, locale)) }, o);
	return `${longDate(date, locale)} · ${minutes}`;
}

/** One article as an image-led card: photo, brand · topic, title, a short standfirst, reading time. */
export function StoryCard({
	article: a,
	locale,
}: {
	article: Article;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	const cover = coverView(a, locale, "card");
	return (
		<ArticleCard
			class="bl-card"
			href={routes.article(locale, a.slug)}
			title={a.title[locale]}
			topic={overline(a, locale)}
			excerpt={a.status === "in-review" ? m.in_review_row({}, o) : a.standfirst[locale]}
			picture={cover.picture}
			image={cover.image?.src}
			status={statusOf(a, locale)}
			meta={metaOf(a, locale)}
		/>
	);
}

/** Cards in a responsive grid: one column on a phone, two, then three. */
export function StoryGrid({
	articles,
	locale,
	label,
}: {
	articles: ReadonlyArray<Article>;
	locale: Locale;
	label?: string;
}): JSX.Element {
	return (
		<ul class="bl-grid" aria-label={label}>
			{articles.map((a) => (
				<li key={a.slug}>
					<StoryCard article={a} locale={locale} />
				</li>
			))}
		</ul>
	);
}
