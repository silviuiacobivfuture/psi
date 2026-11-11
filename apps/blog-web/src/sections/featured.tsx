import { ArticleCover } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { PublishedArticle } from "../content/schema";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import { overline, RowMeta } from "./article-meta";

/** The newest published article as a 3:2 cover beside its title and standfirst. */
export function Featured({
	article: a,
	locale,
}: {
	article: PublishedArticle;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	const href = routes.article(locale, a.slug);
	return (
		<article class="bl-featured grid items-center gap-8 md:grid-cols-12 md:gap-12">
			<a
				href={href}
				class="bl-featured__media md:col-span-7"
				tabindex={-1}
				aria-label={a.title[locale]}
			>
				<ArticleCover hue={1}>
					<span class="bl-cover-mark">¶</span>
				</ArticleCover>
			</a>
			<div class="md:col-span-5">
				<p class="bl-overline">
					<span class="text-glow-1">{m.featured_overline({}, o)}</span>
					<span aria-hidden="true"> · </span>
					{overline(a, locale)}
				</p>
				<h3 class="bl-featured__title mt-4">
					<a href={href}>{a.title[locale]}</a>
				</h3>
				<p class="mt-5 text-body-lg text-ink-muted">{a.standfirst[locale]}</p>
				<p class="bl-meta mt-6">
					<RowMeta article={a} locale={locale} />
				</p>
				<a class="bl-more mt-7" href={href}>
					{m.read_article({}, o)}
					<span aria-hidden="true">→</span>
				</a>
			</div>
		</article>
	);
}
