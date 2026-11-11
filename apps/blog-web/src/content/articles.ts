import { z } from "zod";
import type { BlogBrand } from "../brands";
import type { Locale } from "../i18n";
import { EDITORIAL_POLICY } from "./editorial-policy";
import { Article, type PublishedArticle, type Topic } from "./schema";

type Draft = z.input<typeof Article>;

/** A backlog entry from content-strategy.md: titled, placed in its hub, not yet written. */
function inReview(
	backlogNo: number,
	slug: string,
	topic: Topic,
	title: { ro: string; en: string },
): Draft {
	return {
		backlogNo,
		slug,
		brand: "psizone",
		topic,
		title,
		status: "in-review",
		author: null,
		reviewer: null,
	};
}

/**
 * Wave 1 of the backlog (articles 1–10, Romanian titles exactly as in content-strategy.md), plus
 * the editorial-policy article. Nothing clinical is written here: the backlog entries carry no body
 * until a psychologist has written and a clinician has reviewed them.
 */
const SOURCE: ReadonlyArray<Draft> = [
	EDITORIAL_POLICY,
	inReview(1, "primele-semne-de-autism-pe-varste", "autism", {
		ro: "Primele semne de autism, pe vârste",
		en: "The first signs of autism, by age",
	}),
	inReview(2, "evaluarea-pentru-autism", "autism", {
		ro: "Ce se întâmplă la o evaluare pentru autism",
		en: "What happens at an autism assessment",
	}),
	inReview(3, "terapia-aba-pe-intelees", "autism", {
		ro: "Terapia ABA pe înțeles",
		en: "ABA therapy, plainly explained",
	}),
	inReview(4, "adhd-sau-doar-energie", "adhd", {
		ro: "ADHD sau doar energie?",
		en: "ADHD, or just energy?",
	}),
	inReview(5, "neurofeedback-pentru-atentie", "adhd", {
		ro: "Neurofeedback pentru atenție: ce spun studiile",
		en: "Neurofeedback for attention: what the studies say",
	}),
	inReview(6, "timpul-pe-ecrane", "adolescenti", {
		ro: "Timpul pe ecrane: ghid pentru părinți",
		en: "Screen time: a guide for parents",
	}),
	inReview(7, "suprastimularea-senzoriala", "integrare-senzoriala", {
		ro: "Semnele unei suprastimulări senzoriale",
		en: "The signs of sensory overload",
	}),
	inReview(8, "cand-cel-mic-nu-vorbeste", "logopedie", {
		ro: "Când să te îngrijoreze că cel mic nu vorbește",
		en: "When to worry that your little one isn’t talking",
	}),
	inReview(9, "harta-cerebrala-qeeg", "qeeg", {
		ro: "Ce este o hartă cerebrală QEEG",
		en: "What a QEEG brain map is",
	}),
	inReview(10, "atacul-de-panica", "anxietate-depresie", {
		ro: "Atacul de panică: ce e și ce ajută",
		en: "Panic attacks: what they are and what helps",
	}),
];

export const ARTICLES: ReadonlyArray<Article> = z
	.array(Article)
	.parse(SOURCE)
	.filter((a, i, all) => all.findIndex((b) => b.slug === a.slug) === i);

export function findArticle(slug: string): Article | undefined {
	return ARTICLES.find((a) => a.slug === slug);
}

export function isPublished(a: Article): a is PublishedArticle {
	return a.status === "published";
}

/** What the index is narrowed to (`?brand=`, `?topic=`); unset means everything. */
export interface ArticleFilter {
	brand?: BlogBrand;
	topic?: Topic;
}

function matches(a: Article, f: ArticleFilter): boolean {
	return (
		(f.brand === undefined || a.brand === f.brand) && (f.topic === undefined || a.topic === f.topic)
	);
}

/** Published articles, newest first. */
export function published(f: ArticleFilter = {}): ReadonlyArray<PublishedArticle> {
	return ARTICLES.filter(isPublished)
		.filter((a) => matches(a, f))
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Articles still being written and reviewed, in backlog order. */
export function inProgress(f: ArticleFilter = {}): ReadonlyArray<Article> {
	return ARTICLES.filter((a) => a.status === "in-review")
		.filter((a) => matches(a, f))
		.sort((a, b) => (a.backlogNo ?? 99) - (b.backlogNo ?? 99));
}

/** Topics that have at least one article, in the order they first appear. */
export function usedTopics(): ReadonlyArray<Topic> {
	return [...new Set(ARTICLES.map((a) => a.topic))];
}

/** Rough reading time of a body, at about 230 words a minute. */
export function readingMinutes(a: PublishedArticle, locale: Locale): number {
	const words = a.body
		.flatMap((b) => (b.type === "list" ? b.items.map((i) => i[locale]) : [b.text[locale]]))
		.join(" ")
		.split(/\s+/).length;
	return Math.max(1, Math.round(words / 230));
}
