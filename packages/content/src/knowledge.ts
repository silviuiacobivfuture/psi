import { ARTICLES } from "./articles/catalogue";
import { LOCALES, type Locale } from "./locale";
import { articleUrl } from "./routes";
import { type Article, isReadable, type ReadableArticle } from "./schema";

/**
 * The repository's articles as knowledge entries for the guide's index (the shape of
 * `@psi/knowledge`'s `KnowledgeEntryInput`, written out here so this package depends on nothing).
 * One entry per article and locale in the brand's index and one in the blog's: the standfirst,
 * the body as Markdown-ish text, then its questions and answers. Status and review travel along,
 * so the knowledge base's own rule decides what the guide may retrieve (drafts never).
 */
export interface ArticleKnowledgeEntry {
	id: string;
	brand: "psizone" | "eqsync" | "hemisync" | "blog";
	locale: Locale;
	kind: "clinical" | "editorial";
	title: string;
	url: string;
	body: string;
	hub?: string;
	status: "draft" | "published";
	reviewedBy: string | null;
	reviewedAt: string | null;
}

function text(a: ReadableArticle, locale: Locale): string {
	const lines = [a.standfirst[locale]];
	for (const b of a.body) {
		if (b.type === "h2") lines.push(`## ${b.text[locale]}`);
		else if (b.type === "quote") lines.push(`> ${b.text[locale]}`);
		else if (b.type === "list") lines.push(b.items.map((i) => `- ${i[locale]}`).join("\n"));
		else lines.push(b.text[locale]);
	}
	if (a.faq.length > 0) {
		lines.push(locale === "ro" ? "## Întrebări frecvente" : "## Frequently asked questions");
		for (const f of a.faq) lines.push(`**${f.q[locale]}**\n${f.a[locale]}`);
	}
	return lines.join("\n\n");
}

export function articleKnowledge(
	articles: ReadonlyArray<Article> = ARTICLES,
): ArticleKnowledgeEntry[] {
	return articles.filter(isReadable).flatMap((a) =>
		LOCALES.flatMap((locale): ArticleKnowledgeEntry[] => {
			const health = a.kind === "health";
			const reviewed = a.status === "published" && a.kind === "health" ? a.reviewer : null;
			const base = {
				locale,
				kind: health ? ("clinical" as const) : ("editorial" as const),
				title: a.title[locale],
				url: articleUrl(locale, a.slug),
				body: text(a, locale),
				hub: a.topic,
				status: a.status,
				reviewedBy: reviewed?.name ?? null,
				reviewedAt: reviewed?.reviewedAt ?? null,
			};
			return [
				{ ...base, id: `content.ar.${a.slug}.${locale}`, brand: a.brand },
				{ ...base, id: `content.ar.${a.slug}.${locale}.blog`, brand: "blog" },
			];
		}),
	);
}
