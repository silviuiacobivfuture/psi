import { brandListingUrl, longDate } from "@psi/content";
import { ArticleFeed, Button } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { latestArticles } from "../cms";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/**
 * "From the blog": Psizone's newest articles, and only Psizone's, each linking to the blog. Nothing
 * renders while there is nothing to show (production, before the first article is approved).
 */
export function FromTheBlog({ locale }: { locale: Locale }): JSX.Element | null {
	const o = at(locale);
	const articles = latestArticles(locale, 3);
	if (articles.length === 0) return null;
	return (
		<section id="blog" class="mx-auto max-w-6xl px-5 py-24 md:py-36" aria-labelledby="din-blog">
			<div class="flex flex-wrap items-end justify-between gap-8">
				<div>
					<p class="text-overline uppercase text-ink-muted">{m.blog_overline({}, o)}</p>
					<h2 id="din-blog" class="display pz-rise mt-4 max-w-3xl text-display-lg text-ink">
						{m.blog_title({}, o)}
					</h2>
				</div>
				<Button variant="ghost" arrow href={brandListingUrl(locale, "psizone")}>
					{m.blog_all({}, o)}
				</Button>
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
