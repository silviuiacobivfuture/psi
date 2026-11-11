import { Prose } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Block, PublishedArticle } from "../content/schema";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

function BlockView({ block: b, locale }: { block: Block; locale: Locale }): JSX.Element {
	switch (b.type) {
		case "p":
			return <p>{b.text[locale]}</p>;
		case "h2":
			return <h2>{b.text[locale]}</h2>;
		case "quote":
			return (
				<blockquote>
					<p>{b.text[locale]}</p>
				</blockquote>
			);
		case "list":
			return (
				<ul>
					{b.items.map((i) => (
						<li>{i[locale]}</li>
					))}
				</ul>
			);
	}
}

/** The article's typed blocks rendered as long-form reading, then its sources when it has any. */
export function ArticleBody({
	article: a,
	locale,
}: {
	article: PublishedArticle;
	locale: Locale;
}): JSX.Element {
	return (
		<Prose class="mx-auto">
			{a.body.map((b) => (
				<BlockView block={b} locale={locale} />
			))}
			{a.sources.length > 0 ? (
				<>
					<h2>{m.sources_title({}, at(locale))}</h2>
					<ol>
						{a.sources.map((s) => (
							<li>
								<a href={s.href} rel="noopener">
									{s.label[locale]}
								</a>
							</li>
						))}
					</ol>
				</>
			) : null}
		</Prose>
	);
}
