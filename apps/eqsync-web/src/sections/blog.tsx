import { brandListingUrl, longDate } from "@psi/content";
import { ArticleFeed, Button } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { latestArticles } from "../cms";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/**
 * "From the blog": EQ-SYNC's newest articles, each linking to the blog. Nothing renders while there
 * is nothing to show (production, before the first article is approved).
 */
export function FromTheBlog({ locale }: { locale: Locale }): JSX.Element | null {
	const o = at(locale);
	const articles = latestArticles(locale, 3);
	if (articles.length === 0) return null;
	return (
		<section id="blog" class="scroll-mt-28" aria-labelledby="din-blog">
			<div class="mx-auto max-w-6xl px-5 py-24 md:py-32">
				<div class="flex flex-wrap items-end justify-between gap-8">
					<div class="max-w-2xl">
						<p class="eq-overline">{m.blog_overline({}, o)}</p>
						<h2 id="din-blog" class="display eq-h2 pz-rise mt-5 text-ink">
							{m.blog_title({}, o)}
						</h2>
					</div>
					<Button variant="glass" arrow href={brandListingUrl(locale, "eqsync")}>
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
			</div>
		</section>
	);
}
