import type { AskContext } from "./ask-context";
import { catalogItems } from "./catalog";
import { within } from "./deadline";

/** How long a warm-up may take before it is left to finish (or fail) on its own. */
const WARM_MS = 15_000;

/**
 * Warms one profile before its first visitor: the settings, the catalog (the tools' shapes), and
 * one search, which opens the vector store's connection and the embedder's (the same OpenRouter
 * host the model uses). Never throws: a failure only means the first turn pays for it.
 */
export async function warmProfile(ctx: AskContext, locale: string): Promise<void> {
	const scope = ctx.profile.knowledgeScope;
	const catalog = ctx.knowledge.catalog;
	await within(
		Promise.allSettled([
			ctx.settings.current(),
			catalog === undefined ? Promise.resolve() : catalogItems(catalog, scope, locale),
			ctx.knowledge.search({ query: ctx.profile.name, scope, locale, topK: 1 }),
		]),
		WARM_MS,
		"warm-up",
	).catch(() => undefined);
}
