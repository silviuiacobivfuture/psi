/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { ArticleCard } from "./article-card";

/**
 * What a feed card needs of an article. `@psi/content`'s `ArticleSummary` satisfies it as is; the
 * library declares its own shape so it never depends on where articles come from.
 */
export interface FeedArticle {
	/** Absolute: the card leaves this site for the blog. */
	url: string;
	title: string;
	standfirst: string;
	status: "published" | "draft";
}

/** Every word the feed shows, already translated by the app. The library ships no text. */
export interface ArticleFeedLabels<T extends FeedArticle> {
	/** The list's accessible name: "Articole din blog". */
	list: string;
	/** The marker on an unreviewed draft (staging only): "Ciornă". */
	draft: string;
	/** The card's metadata line, composed by the app: "12 noiembrie 2026 · 4 min de citit". */
	meta: (article: T) => string;
}

export interface ArticleFeedProps<T extends FeedArticle> {
	articles: ReadonlyArray<T>;
	labels: ArticleFeedLabels<T>;
	class?: string;
}

/**
 * A brand's latest articles as cards, each linking to its page on the blog. The heading and the
 * "all articles" link belong to the site's own section, in its own type.
 */
export function ArticleFeed<T extends FeedArticle>({
	articles,
	labels,
	class: className,
}: ArticleFeedProps<T>): JSX.Element {
	return (
		<ul
			class={cx("grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3", className)}
			aria-label={labels.list}
		>
			{articles.map((a) => (
				<li class="flex">
					<ArticleCard
						href={a.url}
						title={a.title}
						topic={a.status === "draft" ? labels.draft : undefined}
						excerpt={a.standfirst}
						meta={labels.meta(a)}
					/>
				</li>
			))}
		</ul>
	);
}
