import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Source } from "../contract";
import type { Profile } from "../profile";
import { fold } from "../text/normalize";
import type { AnswerTurn } from "./agent-tools";

export const FIND_ARTICLES_TOOL = "findArticles";
/** Articles one call returns at most. */
export const ARTICLES_PER_CALL = 6;

/** One article as the guide may name it: metadata and a link, never the body. */
export interface ArticleHit {
	title: string;
	standfirst: string;
	topic: string;
	brand: string;
	/** Absolute, canonical address on the blog. */
	url: string;
	readingMinutes: number;
	/** ISO date a reader sees. */
	date: string;
}

export interface ArticleQuery {
	/** The asking profile: the consumer's policy decides which brands' articles it may list. */
	profile: string;
	locale: string;
	/** Free words; absent or blank lists the newest. */
	query?: string;
	topic?: string;
	brand?: string;
	limit: number;
}

/** What a lookup found, and which topics and brands the asking profile may still narrow by. */
export interface ArticleFinding {
	/** All matches, of which `articles` are the first `limit`. */
	total: number;
	articles: ReadonlyArray<ArticleHit>;
	topics: ReadonlyArray<string>;
	brands: ReadonlyArray<string>;
}

/**
 * The consumer's catalogue of public articles (the blog). The engine knows nothing of its source,
 * visibility policy or brand segregation: `find` applies them for the asking profile.
 */
export interface EngineArticles {
	find(query: ArticleQuery): ArticleFinding | Promise<ArticleFinding>;
}

const Hit: z.ZodType<ArticleHit> = z.object({
	title: z.string(),
	standfirst: z.string(),
	topic: z.string(),
	brand: z.string(),
	url: z.string(),
	readingMinutes: z.number(),
	date: z.string(),
});

const Output = z.object({
	total: z.number().int().nonnegative(),
	articles: z.array(Hit),
	topics: z.array(z.string()),
	brands: z.array(z.string()),
	note: z.string().optional(),
});

/** An article the tool returned in this answer: what a source chip needs. */
export interface ArticleLink {
	title: string;
	url: string;
}

function plain(text: string): string {
	return ` ${fold(text)
		.replace(/[^a-z0-9]+/g, " ")
		.trim()} `;
}

/**
 * The articles an answer names, as source chips: those the tool returned this turn whose title
 * (or address) appears in the reply. Deterministic, so a recommendation is clickable whether or
 * not the model wrote the link. Each article once, in the order the tool returned it.
 */
export function mentionedArticles(
	reply: string,
	returned: ReadonlyArray<ArticleLink>,
): ReadonlyArray<Source> {
	const said = plain(reply);
	const seen = new Set<string>();
	const out: Array<Source> = [];
	for (const a of returned) {
		if (seen.has(a.url)) continue;
		if (!said.includes(plain(a.title)) && !reply.includes(a.url)) continue;
		seen.add(a.url);
		out.push({
			id: `article:${a.url}`,
			title: a.title,
			url: a.url,
			reviewedBy: null,
			reviewedAt: null,
		});
	}
	return out;
}

export interface ArticleToolOptions {
	profile: Profile;
	articles: EngineArticles;
	turnFor: (ctx: { requestContext?: RequestContext }) => AnswerTurn;
}

/**
 * `findArticles`: lists or searches the blog's articles the asking profile may recommend, as
 * titles, standfirsts, topics and absolute links. What it returns is registered as shown, so the
 * reply may name those titles and topics; the text of an article is read with `searchKnowledge`.
 */
export function createArticlesTool(opts: ArticleToolOptions) {
	return createTool({
		id: FIND_ARTICLES_TOOL,
		description: `The blog's articles ${opts.profile.name} may recommend. Call it for every question about articles or the blog ("do you have articles", "anything about X", "what can I read") and, once a question is answered, to offer one relevant article as the next step; searchKnowledge does not list articles. Returns title, summary, topic, brand and the article's link, no article text. Name only the articles it returns, and give each link exactly as returned; if none matches, say so and offer the newest it lists.`,
		inputSchema: z.object({
			query: z
				.string()
				.trim()
				.max(200)
				.optional()
				.describe("Words of the subject, in the site's language; leave out to list the newest"),
			topic: z.string().trim().max(60).optional().describe("Only this topic, when you know it"),
			brand: z.string().trim().max(20).optional().describe("Only this brand's articles"),
		}),
		outputSchema: Output,
		execute: async (input, ctx) => {
			const turn = opts.turnFor(ctx);
			if (!turn.take())
				return { total: 0, articles: [], topics: [], brands: [], note: "Tool call limit reached." };
			const started = Date.now();
			const found = await opts.articles.find({
				profile: opts.profile.id,
				locale: turn.locale,
				...(input.query === undefined || input.query === "" ? {} : { query: input.query }),
				...(input.topic === undefined || input.topic === "" ? {} : { topic: input.topic }),
				...(input.brand === undefined || input.brand === "" ? {} : { brand: input.brand }),
				limit: ARTICLES_PER_CALL,
			});
			turn.articles.push(...found.articles.map((a) => ({ title: a.title, url: a.url })));
			turn.shown.push(
				...found.articles.flatMap((a) => [
					a.title,
					a.standfirst,
					a.topic.replace(/[-_]+/g, " "),
					a.url,
					`${a.readingMinutes} min`,
				]),
			);
			turn.timings.push({
				tool: FIND_ARTICLES_TOOL,
				ms: Date.now() - started,
				passages: found.articles.length,
			});
			return Output.parse({
				total: found.total,
				articles: found.articles,
				topics: found.topics,
				brands: found.brands,
				...(found.articles.length === 0
					? { note: "No article matches; say so, do not invent one." }
					: {}),
			});
		},
	});
}
