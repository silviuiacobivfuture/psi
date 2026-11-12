import type { ToolsInput } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { type CatalogItem, catalogEntry, catalogItems, type EngineCatalog } from "../catalog";
import type { EngineKnowledge, Passage } from "../contract";
import type { Profile } from "../profile";
import { fold } from "../text/normalize";
import type { ToolTiming } from "../timing";
import {
	type ArticleLink,
	createArticlesTool,
	type EngineArticles,
	FIND_ARTICLES_TOOL,
} from "./article-tool";
import { type ScopedSearch, SEARCH_TOOL_ID, scopeSearch } from "./knowledge-tool";
import { type NumberedPassage, SourceLedger } from "./ledger";
import {
	createServicesTool,
	type EngineServices,
	RECOMMEND_SERVICES_TOOL,
	type ServiceFact,
} from "./services-tool";

/** Where an answer's turn travels to the tools: Mastra's request context, under this key. */
export const TURN_KEY = "engine.turn";
/** The most tool calls one answer may make; further calls return nothing and say so. */
export const MAX_TOOL_CALLS = 4;
/** What one tool result may carry, in characters (about 1 200 tokens). */
export const RESULT_BUDGET_CHARS = 4_800;
/** Titles listed per topic by `listTopics`. */
const TITLES_PER_TOPIC = 6;
/** Pages `findPage` returns. */
const PAGES_FOUND = 2;

export const LIST_TOPICS_TOOL = "listTopics";
export const GET_ENTRY_TOOL = "getEntry";
export const FIND_PAGE_TOOL = "findPage";

/**
 * One answer as its tools see it: the ledger every returned passage is registered in (so the
 * answer can cite it, and the gate can check it), the search bound to the profile's scope, the
 * configured locale and the runtime settings, and the tool-call budget.
 */
export class AnswerTurn {
	readonly ledger: SourceLedger;
	readonly locale: string;
	readonly search: ScopedSearch;
	/** What the tools showed beyond passages (the topic names and titles), for the claims check. */
	readonly shown: Array<string> = [];
	/** The articles `findArticles` returned, which the reply may name (shown as source chips). */
	readonly articles: Array<ArticleLink> = [];
	/** The services `recommendServices` returned, which the reply may name (shown as buttons). */
	readonly services: Array<ServiceFact> = [];
	/** Each tool call's time and result size, for the turn's timing. */
	readonly timings: Array<ToolTiming> = [];
	#calls = 0;

	constructor(ledger: SourceLedger, locale: string, search: ScopedSearch) {
		this.ledger = ledger;
		this.locale = locale;
		this.search = search;
	}

	/** Counts one tool call; false once the budget is spent. */
	take(): boolean {
		this.#calls += 1;
		return this.#calls <= MAX_TOOL_CALLS;
	}

	get calls(): number {
		return this.#calls;
	}
}

const NumberedSchema: z.ZodType<NumberedPassage> = z.object({
	n: z.number().int().positive(),
	title: z.string(),
	text: z.string(),
});

const PassagesOutput = z.object({
	passages: z.array(NumberedSchema).readonly(),
	note: z.string().optional(),
});
type PassagesResult = z.infer<typeof PassagesOutput>;

const TopicsOutput = z.object({
	topics: z.array(
		z.object({ topic: z.string(), entries: z.number().int(), titles: z.array(z.string()) }),
	),
});

const LOOKUP_FAILED_NOTE =
	"This lookup returned nothing just now. Do not tell the visitor that a page or a tool failed or did not answer. Carry on with what you already know from your rules (the contact facts) and offer the next step.";
const LIMIT_NOTE = `Tool call limit (${MAX_TOOL_CALLS}) reached: answer from the passages you have.`;

/** Keeps passages within the result budget; the last one may be cut. */
function withinBudget(passages: ReadonlyArray<Passage>): ReadonlyArray<Passage> {
	const out: Array<Passage> = [];
	let left = RESULT_BUDGET_CHARS;
	for (const p of passages) {
		if (left <= 0) break;
		const text = p.text.length > left ? `${p.text.slice(0, left).trimEnd()}…` : p.text;
		out.push({ ...p, text });
		left -= text.length;
	}
	return out;
}

function enumOf(values: ReadonlyArray<string>): z.ZodEnum<[string, ...string[]]> | undefined {
	const [first, ...rest] = [...new Set(values)];
	return first === undefined ? undefined : z.enum([first, ...rest]);
}

function topicsOf(items: ReadonlyArray<CatalogItem>): Map<string, ReadonlyArray<CatalogItem>> {
	const by = new Map<string, Array<CatalogItem>>();
	for (const item of items) by.set(item.topic, [...(by.get(item.topic) ?? []), item]);
	return by;
}

/** The pages best matching a title or a URL, by folded words in common. */
function matchPages(items: ReadonlyArray<CatalogItem>, query: string): ReadonlyArray<CatalogItem> {
	const wanted = fold(query)
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= 3);
	if (wanted.length === 0) return [];
	return items
		.map((item) => {
			const hay = fold(`${item.title} ${item.url.replace(/[/_.-]+/g, " ")}`);
			return { item, hits: wanted.filter((w) => hay.includes(w.slice(0, 5))).length };
		})
		.filter((x) => x.hits > 0)
		.sort((a, b) => b.hits - a.hits)
		.slice(0, PAGES_FOUND)
		.map((x) => x.item);
}

export interface ProfileToolsOptions {
	profile: Profile;
	knowledge: EngineKnowledge;
	/** The locale Studio and other callers without a turn see. */
	defaultLocale: string;
	/** The language each locale's queries are written in ("Romanian"), for the search tool. */
	languageName: (locale: string) => string;
	retrievalMs: number;
	/** The blog's articles, when the consumer has them: adds `findArticles`. */
	articles?: EngineArticles;
	/** The consumer's services: adds `recommendServices`. */
	services?: EngineServices;
}

/** Reads this answer's turn from the request context; a standalone one for Studio's own chat. */
function turnOf(opts: ProfileToolsOptions, requestContext: RequestContext | undefined): AnswerTurn {
	const held = requestContext?.get(TURN_KEY);
	if (held instanceof AnswerTurn) return held;
	return new AnswerTurn(
		new SourceLedger(),
		opts.defaultLocale,
		scopeSearch({
			knowledge: opts.knowledge,
			scope: opts.profile.knowledgeScope,
			locale: opts.defaultLocale,
			timeoutMs: opts.retrievalMs,
			signal: new AbortController().signal,
		}),
	);
}

async function register(
	turn: AnswerTurn,
	tool: string,
	load: () => Promise<ReadonlyArray<Passage>>,
): Promise<PassagesResult> {
	if (!turn.take()) return { passages: [], note: LIMIT_NOTE };
	const started = Date.now();
	try {
		const passages = turn.ledger.register(withinBudget(await load()));
		turn.timings.push({ tool, ms: Date.now() - started, passages: passages.length });
		return { passages };
	} catch {
		// A lookup that fails is the visitor's business never: the reply carries on from the facts
		// it knows (the profile's own contact facts), without saying a page did not answer.
		turn.timings.push({ tool, ms: Date.now() - started, passages: 0 });
		return { passages: [], note: LOOKUP_FAILED_NOTE };
	}
}

/** The catalog tools, hydrated with the catalog's current shape for one locale. */
function catalogTools(
	opts: ProfileToolsOptions,
	catalog: EngineCatalog,
	items: ReadonlyArray<CatalogItem>,
	turnFor: (ctx: { requestContext?: RequestContext }) => AnswerTurn,
): ToolsInput {
	const scope = opts.profile.knowledgeScope;
	const topics = topicsOf(items);
	const ids = enumOf(items.map((i) => i.id));
	const tools: ToolsInput = {
		[LIST_TOPICS_TOOL]: createTool({
			id: LIST_TOPICS_TOOL,
			description: `List the topics of ${opts.profile.name}'s reviewed content (${topics.size} topics, ${items.length} entries), with a few entry titles each. Returns no content: use searchKnowledge or getEntry to read.`,
			inputSchema: z.object({}),
			outputSchema: TopicsOutput,
			execute: async (_input, ctx) => {
				const listed = [...topics].map(([topic, list]) => ({
					topic,
					entries: list.length,
					titles: list.slice(0, TITLES_PER_TOPIC).map((i) => i.title),
				}));
				turnFor(ctx).shown.push(
					...listed.flatMap((t) => [t.topic.replace(/[-_]+/g, " "), ...t.titles]),
				);
				return { topics: listed };
			},
		}),
		[FIND_PAGE_TOOL]: createTool({
			id: FIND_PAGE_TOOL,
			description: `Find a page of ${opts.profile.name} by its title or address (e.g. "contact") and read its reviewed text. Returns numbered passages; cite them as [n].`,
			inputSchema: z.object({ titleOrUrl: z.string().trim().min(1).max(200) }),
			outputSchema: PassagesOutput,
			execute: async ({ titleOrUrl }, ctx) => {
				const turn = turnFor(ctx);
				return register(turn, FIND_PAGE_TOOL, async () => {
					const pages = matchPages(items, titleOrUrl);
					const found = await Promise.all(
						pages.map((p) => catalogEntry(catalog, scope, turn.locale, p.id)),
					);
					return found.flatMap((passages) => passages.slice(0, 1));
				});
			},
		}),
	};
	if (ids !== undefined) {
		tools[GET_ENTRY_TOOL] = createTool({
			id: GET_ENTRY_TOOL,
			description: `Read one reviewed entry in full by its id (${items.length} entries: ${items
				.slice(0, 12)
				.map((i) => `${i.id} "${i.title}"`)
				.join(
					", ",
				)}${items.length > 12 ? ", …" : ""}). Returns numbered passages; cite them as [n].`,
			inputSchema: z.object({ id: ids }),
			outputSchema: PassagesOutput,
			execute: async ({ id }, ctx) => {
				const turn = turnFor(ctx);
				return register(turn, GET_ENTRY_TOOL, () => catalogEntry(catalog, scope, turn.locale, id));
			},
		});
	}
	for (const lookup of catalog.lookups ?? []) {
		const chosen = lookup.select(items);
		if (chosen.length === 0) continue;
		tools[lookup.id] = createTool({
			id: lookup.id,
			description: `${lookup.description} Returns numbered passages; cite them as [n].`,
			inputSchema: z.object({}),
			outputSchema: PassagesOutput,
			execute: async (_input, ctx) => {
				const turn = turnFor(ctx);
				return register(turn, lookup.id, async () =>
					(
						await Promise.all(chosen.map((id) => catalogEntry(catalog, scope, turn.locale, id)))
					).flat(),
				);
			},
		});
	}
	return tools;
}

/**
 * A profile's tools, hydrated on every call from the knowledge's current catalog (so an ingest
 * shows at once): `searchKnowledge` (the tiered search) and, when the knowledge has a catalog,
 * `listTopics`, `getEntry`, `findPage` and the consumer's structured lookups. Their descriptions
 * and enums carry the catalog's shape (topics, entry ids and titles, counts), never its content.
 * Every passage a tool returns is registered in the answer's ledger, within a per-result budget,
 * and an answer may make at most `MAX_TOOL_CALLS` calls. Mastra-native: `createTool` with zod
 * schemas, given to the agent as its (dynamic) tools, so Studio lists them.
 */
export function createProfileTools(
	opts: ProfileToolsOptions,
): (ctx: { requestContext: RequestContext }) => Promise<ToolsInput> {
	return async ({ requestContext }) => {
		// The answer's turn, or one per hydration for tools called without an answer (Studio).
		const standalone = turnOf(opts, requestContext);
		const locale = standalone.locale;
		const turnFor = (ctx: { requestContext?: RequestContext }): AnswerTurn => {
			const held = ctx.requestContext?.get(TURN_KEY);
			return held instanceof AnswerTurn ? held : standalone;
		};
		const catalog = opts.knowledge.catalog;
		const items =
			catalog === undefined ? [] : await catalogItems(catalog, opts.profile.knowledgeScope, locale);
		const topics = enumOf(items.map((i) => i.topic));
		// The tools' descriptions name the catalog's topics and titles: what the model saw there may
		// be named in a reply (a sad visitor pointed to the "anxiety and depression" hub).
		const held = requestContext.get(TURN_KEY);
		if (held instanceof AnswerTurn) {
			held.shown.push(...items.flatMap((i) => [i.topic.replace(/[-_]+/g, " "), i.title]));
		}
		const query = z
			.string()
			.trim()
			.min(1)
			.max(300)
			.describe(`What to look up, written in ${opts.languageName(locale)}, the site's language`);
		const inputSchema =
			topics === undefined
				? z.object({ query })
				: z.object({
						query,
						topic: topics.optional().describe("Only this topic's entries, when you know it"),
					});
		const inTopic = (topic: string | undefined): ReadonlySet<string> | undefined =>
			topic === undefined
				? undefined
				: new Set(items.filter((i) => i.topic === topic).map((i) => i.id));
		const search = createTool({
			id: SEARCH_TOOL_ID,
			description: `Search ${opts.profile.name}'s reviewed, published content${
				items.length > 0
					? ` (${items.length} entries; topics: ${[...new Set(items.map((i) => i.topic))].join(", ")})`
					: ""
			}. Returns numbered passages; cite them as [n]. Call it before answering.`,
			inputSchema,
			outputSchema: PassagesOutput,
			execute: async (input, ctx) => {
				const turn = turnFor(ctx);
				const topic = "topic" in input && typeof input.topic === "string" ? input.topic : undefined;
				return register(turn, SEARCH_TOOL_ID, async () => {
					const found = await turn.search(input.query);
					const only = inTopic(topic);
					const narrowed = only === undefined ? found : found.filter((p) => only.has(p.source.id));
					return narrowed.length > 0 ? narrowed : found;
				});
			},
		});
		return {
			[SEARCH_TOOL_ID]: search,
			...(catalog === undefined ? {} : catalogTools(opts, catalog, items, turnFor)),
			...(opts.articles === undefined
				? {}
				: {
						[FIND_ARTICLES_TOOL]: createArticlesTool({
							profile: opts.profile,
							articles: opts.articles,
							turnFor,
						}),
					}),
			...servicesTool(opts, turnFor),
		};
	};
}

function servicesTool(
	opts: ProfileToolsOptions,
	turnFor: (ctx: { requestContext?: RequestContext }) => AnswerTurn,
): ToolsInput {
	if (opts.services === undefined) return {};
	const tool = createServicesTool({ profile: opts.profile, services: opts.services, turnFor });
	return tool === undefined ? {} : { [RECOMMEND_SERVICES_TOOL]: tool };
}
