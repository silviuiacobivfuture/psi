import type { Brand, Locale } from "../contract";
import { SPACE_PATTERN } from "../embedder/types";

/** Every table this package owns starts with this; nothing else in a shared DB is touched. */
export const INDEX_PREFIX = "kb_";

/**
 * One index per brand, locale and vector space: `kb_<brand>_<locale>_<space>`.
 * Search derives its index from the query's brand and locale and reads nothing else, so a
 * Psizone query can never see a Hemi-Sync chunk (and vice versa): isolation by construction.
 * The space keeps vectors of different embedders (and dimensions) apart.
 */
export function indexName(brand: Brand, locale: Locale, space: string): string {
	if (!SPACE_PATTERN.test(space)) {
		throw new Error(`invalid embedder space "${space}": [a-z0-9_], at most 24 characters`);
	}
	return `${INDEX_PREFIX}${brand}_${locale}_${space}`;
}

export function isOwnIndex(name: string): boolean {
	return name.startsWith(INDEX_PREFIX);
}
