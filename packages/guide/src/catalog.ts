import type { CatalogLookup, EngineCatalog } from "@psi/engine";
import { type Catalog, isDemoId } from "@psi/knowledge";
import { BrandSchema, LocaleSchema } from "./contract";

/**
 * psi's structured lookups over a brand's catalog, as the agent's tools: the ways to reach the
 * team, and what the site offers. Each selects entries by their shape (page, kind, topic), never
 * by their text.
 */
export const PSI_LOOKUPS: ReadonlyArray<CatalogLookup> = [
	{
		id: "contactDetails",
		description:
			"How to reach the team: the phone numbers, the contact page and what the appointment request asks for.",
		select: (items) => items.filter((i) => /\/contact$/.test(i.url)).map((i) => i.id),
	},
	{
		id: "servicesList",
		description: "What this site offers: its programmes, services and topic pages, by title.",
		select: (items) =>
			items
				.filter((i) => i.kind === "programme" || i.topic !== i.kind)
				.slice(0, 8)
				.map((i) => i.id),
	},
];

/**
 * `@psi/knowledge`'s catalog as the engine's: a profile's scope is its brand. Demo entries are
 * left out unless `demo` is on, as in search.
 */
export function engineCatalog(catalog: Catalog, opts: { demo: boolean }): EngineCatalog {
	const keep = (id: string): boolean => opts.demo || !isDemoId(id);
	return {
		items: (scope, locale) =>
			catalog
				.items(BrandSchema.parse(scope), LocaleSchema.parse(locale))
				.filter((item) => keep(item.id)),
		entry: (scope, locale, id) =>
			keep(id) ? catalog.passages(BrandSchema.parse(scope), LocaleSchema.parse(locale), id) : [],
		lookups: PSI_LOOKUPS,
	};
}
