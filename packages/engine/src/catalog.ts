import { z } from "zod";
import { type Passage, PassagesSchema } from "./contract";

/** One reviewed entry as a catalog describes it: its shape (id, title, page, topic), never its text. */
export interface CatalogItem {
	id: string;
	title: string;
	url: string;
	kind: string;
	/** What `listTopics` groups by (a hub, a method, or the entry's kind). */
	topic: string;
	/** How many passages (chunks) the entry has. */
	chunks: number;
}

/** A structured lookup the consumer defines over its catalog ("contact", "services"). */
export interface CatalogLookup {
	/** The tool's id: `[a-z][a-zA-Z0-9]*`, e.g. `contactDetails`. */
	id: string;
	/** What the model reads to decide when to call it. */
	description: string;
	/** Which entries answer it, chosen from the catalog's items by the consumer's own rule. */
	select(items: ReadonlyArray<CatalogItem>): ReadonlyArray<string>;
}

/**
 * The shape of a knowledge base, per scope and locale, for the agent's catalog tools
 * (`listTopics`, `getEntry`, `findPage` and the consumer's lookups). Whatever it returns is parsed
 * before the engine trusts it.
 */
export interface EngineCatalog {
	items(
		scope: string,
		locale: string,
	): ReadonlyArray<CatalogItem> | Promise<ReadonlyArray<CatalogItem>>;
	/** One entry's full reviewed text, as passages; empty when it is not in this scope and locale. */
	entry(
		scope: string,
		locale: string,
		id: string,
	): ReadonlyArray<Passage> | Promise<ReadonlyArray<Passage>>;
	lookups?: ReadonlyArray<CatalogLookup>;
}

export const CatalogItemsSchema: z.ZodType<ReadonlyArray<CatalogItem>> = z
	.array(
		z.object({
			id: z.string().min(1),
			title: z.string(),
			url: z.string(),
			kind: z.string(),
			topic: z.string(),
			chunks: z.number().int().nonnegative(),
		}),
	)
	.readonly();

/** Reads a catalog's items, parsed. */
export async function catalogItems(
	catalog: EngineCatalog,
	scope: string,
	locale: string,
): Promise<ReadonlyArray<CatalogItem>> {
	return CatalogItemsSchema.parse(await catalog.items(scope, locale));
}

/** Reads one entry's passages, parsed. */
export async function catalogEntry(
	catalog: EngineCatalog,
	scope: string,
	locale: string,
	id: string,
): Promise<ReadonlyArray<Passage>> {
	return PassagesSchema.parse(await catalog.entry(scope, locale, id));
}
