import { brandListingUrl, longDate } from "@psi/content";
import { ArticleFeed } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { latestArticles } from "../cms";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/**
 * "From the blog": Hemi-Sync's newest articles, each linking to the blog. Nothing renders while
 * there is nothing to show (production, before the first article is approved).
 */
export function FromTheBlog({ locale }: { locale: Locale }): JSX.Element | null {
	const o = at(locale);
	const articles = latestArticles(locale, 3);
	if (articles.length === 0) return null;
	return (
		<section
			id="blog"
			class="mx-auto max-w-7xl px-6 pb-24 pt-20 md:px-14 md:pb-32 md:pt-28"
			aria-labelledby="din-blog"
		>
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div>
					<p class="hs-overline">{m.blog_overline({}, o)}</p>
					<h2 id="din-blog" class="display pz-rise mt-4 text-display-lg text-ink">
						{m.blog_title_1({}, o)} <em>{m.blog_title_2({}, o)}</em>
					</h2>
				</div>
				<a class="pz-tap text-link text-body" href={brandListingUrl(locale, "hemisync")}>
					{m.blog_all({}, o)}
				</a>
			</div>
			<ArticleFeed
				class="mt-14"
				articles={articles}
				labels={{
					list: m.blog_list({}, o),
					draft: m.blog_draft({}, o),
					meta: (a) =>
						m.blog_meta({ date: longDate(a.date, locale), minutes: String(a.readingMinutes) }, o),
				}}
			/>
		</section>
	);
}
