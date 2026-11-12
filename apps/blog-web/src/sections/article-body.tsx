import type { Block, ReadableArticle } from "@psi/content";
import { Prose } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** A heading's anchor: lowercase ASCII words joined by hyphens (diacritics folded). */
export function anchorOf(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function BlockView({ block: b, locale }: { block: Block; locale: Locale }): JSX.Element {
	switch (b.type) {
		case "p":
			return <p>{b.text[locale]}</p>;
		case "h2":
			return <h2 id={anchorOf(b.text[locale])}>{b.text[locale]}</h2>;
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

/** Contents: a jump link to each section, when the article is long enough to need one. */
function Contents({ article: a, locale }: { article: ReadableArticle; locale: Locale }) {
	const heads = a.body.flatMap((b) => (b.type === "h2" ? [b.text[locale]] : []));
	if (heads.length < 4) return null;
	return (
		<nav class="bl-toc" aria-labelledby="cuprins">
			<p id="cuprins" class="bl-overline">
				{m.toc_title({}, at(locale))}
			</p>
			<ol>
				{heads.map((h) => (
					<li>
						<a href={`#${anchorOf(h)}`}>{h}</a>
					</li>
				))}
				{a.faq.length > 0 ? (
					<li>
						<a href="#intrebari-frecvente">{m.faq_title({}, at(locale))}</a>
					</li>
				) : null}
			</ol>
		</nav>
	);
}

/**
 * The article's typed blocks rendered as long-form reading: contents, the body, its questions and
 * answers (also printed as FAQPage data by the page), then its sources when it has any.
 */
export function ArticleBody({
	article: a,
	locale,
}: {
	article: ReadableArticle;
	locale: Locale;
}): JSX.Element {
	return (
		<Prose class="mx-auto">
			<Contents article={a} locale={locale} />
			{a.body.map((b) => (
				<BlockView block={b} locale={locale} />
			))}
			{a.faq.length > 0 ? (
				<section class="bl-faq" aria-labelledby="intrebari-frecvente">
					<h2 id="intrebari-frecvente">{m.faq_title({}, at(locale))}</h2>
					{a.faq.map((f) => (
						<details>
							<summary>{f.q[locale]}</summary>
							<p>{f.a[locale]}</p>
						</details>
					))}
				</section>
			) : null}
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
