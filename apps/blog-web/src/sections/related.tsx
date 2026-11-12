import { type Article, latestFor, related, summaryFor } from "@psi/content";
import { ArticleList, ArticleListRow } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { currentIndex, findArticle } from "../content/articles";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import { overline, RowMeta } from "./article-meta";

/**
 * Up to three more articles of the same brand (never another brand's), the same topic first: for
 * a backlog title, the brand's newest. Navigation, not a call to action.
 */
export function Related({
	article: a,
	locale,
}: {
	article: Article;
	locale: Locale;
}): JSX.Element | null {
	const o = at(locale);
	const index = currentIndex();
	const self = summaryFor(a.slug, locale, index);
	const next = (
		self !== undefined
			? related(self, 3, index)
			: latestFor(a.brand, locale, 4, index).filter((s) => s.slug !== a.slug)
	)
		.slice(0, 3)
		.flatMap((s) => {
			const article = findArticle(s.slug);
			return article === undefined ? [] : [article];
		});
	if (next.length === 0) return null;
	return (
		<section class="mt-14 border-t border-line-strong pt-8" aria-labelledby="mai-citeste">
			<h2 id="mai-citeste" class="bl-overline">
				{m.related_title({}, o)}
			</h2>
			<ArticleList class="mt-5">
				{next.map((r) => (
					<ArticleListRow
						href={routes.article(locale, r.slug)}
						title={r.title[locale]}
						overline={overline(r, locale)}
						standfirst={r.status === "in-review" ? undefined : r.standfirst[locale]}
						meta={<RowMeta article={r} locale={locale} />}
					/>
				))}
			</ArticleList>
		</section>
	);
}
