/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { ArticleCard } from "./article-card";
import type { ImageAsset, PictureSpec } from "./picture";

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
	/** The picture to show; null shows the brand's ambient art. */
	cover?:
		| { kind: "set"; alt: string; image: ImageAsset }
		| { kind: "url"; alt: string; src: string }
		| null;
}

const FEED_SIZES = "(min-width: 1024px) 384px, (min-width: 640px) 46vw, calc(100vw - 40px)";

function pictureOf(a: FeedArticle): PictureSpec | undefined {
	return a.cover?.kind === "set"
		? { image: a.cover.image, alt: a.cover.alt, sizes: FEED_SIZES }
		: undefined;
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
						picture={pictureOf(a)}
						image={a.cover?.kind === "url" ? a.cover.src : undefined}
						imageAlt={a.cover?.kind === "url" ? a.cover.alt : undefined}
						status={a.status === "draft" ? labels.draft : undefined}
						excerpt={a.standfirst}
						meta={labels.meta(a)}
					/>
				</li>
			))}
		</ul>
	);
}
