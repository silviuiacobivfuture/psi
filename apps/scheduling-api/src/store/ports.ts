/**
 * The ports beyond the collections: what a StorePort offers that is not a row of a collection (a document with a
 * revision, a screen of the blacklist, a report). Each takes the app first; none returns it, so one wrapper (the test
 * world's alias of app ids) covers every port.
 */

export const DOCUMENT_KINDS = ["floor_plan"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface StoredDocument {
	revision: number;
	/** JSON text the service validated. */
	body: string;
	updatedAt: number;
	updatedBy: string;
}

/** A document an app keeps beside its data, saved with optimistic concurrency. */
export interface DocumentsPort {
	get(app: string, kind: DocumentKind): Promise<StoredDocument | undefined>;
	/**
	 * Saves `body` edited from revision `expected` (0: none stored), as the acting person. One atomic compare-and-set:
	 * `StoreRefused("stale")` when the stored revision is another, `"invalid"` for a body past the store's bound,
	 * `"not_found"` for an app that is not there. Returns the new revision.
	 */
	put(
		app: string,
		kind: DocumentKind,
		expected: number,
		body: string,
	): Promise<{ revision: number; updatedAt: number }>;
}
