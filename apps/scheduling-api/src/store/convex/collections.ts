import type { Collection, CollectionName, Rows } from "../types";

/** What one area of the Convex adapter provides: some of the collections. The assembly (index.ts) checks that all are there. */
export type PartialCollections = { [K in CollectionName]?: Collection<Rows[K]> };
