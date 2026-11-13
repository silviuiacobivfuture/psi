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

export type BlacklistLimit = "any" | "warn_only";

/** An entry as the store keeps it (phone and e-mail already normalised); `client` is the store's client id. */
export interface BlacklistRow {
	id: string;
	client?: string | undefined;
	phone?: string | undefined;
	email?: string | undefined;
	name?: string | undefined;
	reason: string;
	category: "no_show_repeated" | "unpaid" | "abusive" | "duplicate" | "other";
	severity: "warn" | "block_online" | "block_all";
	active: boolean;
	expiresAt?: number | undefined;
	createdBy: string;
	createdAt: number;
	updatedBy: string;
	updatedAt: number;
	version: number;
}

export interface BlacklistInputFields {
	client?: string | undefined;
	phone?: string | undefined;
	email?: string | undefined;
	name?: string | undefined;
	reason: string;
	category: BlacklistRow["category"];
	severity: BlacklistRow["severity"];
	expiresAt?: number | undefined;
}

export interface BlacklistPatchFields {
	client?: string | undefined;
	phone?: string | undefined;
	email?: string | undefined;
	name?: string | undefined;
	reason?: string | undefined;
	category?: BlacklistRow["category"] | undefined;
	severity?: BlacklistRow["severity"] | undefined;
	expiresAt?: number | undefined;
	active?: boolean | undefined;
}

export interface BlacklistHitRow {
	entry: string;
	severity: BlacklistRow["severity"];
	category: BlacklistRow["category"];
	reason: string;
	matchedBy: "client" | "phone" | "email";
	matched: ("client" | "phone" | "email")[];
	nameAgrees: boolean;
}

export interface BlacklistEventRow {
	id: string;
	at: number;
	kind: "online_refused" | "overridden";
	entry: string;
	severity: BlacklistRow["severity"];
	category: BlacklistRow["category"];
	matchedBy: "client" | "phone" | "email";
	channel: "form" | "guide" | "callback" | "staff";
	actor?: string | undefined;
	authority?: "ack" | "staff" | "admin" | undefined;
	overrideReason?: string | undefined;
	subject?: string | undefined;
}

/**
 * The blacklist. Refusals are `StoreRefused` with the wrapper's reason: `invalid` (detail `problems`: the field names),
 * `severity_not_allowed`, `already_expired`, `unknown_client`, `limit`, `exists` (detail `id` of the twin), `not_found`,
 * `stale`, `identifier_required`.
 */
export interface BlacklistPort {
	list(app: string, includeInactive: boolean): Promise<BlacklistRow[]>;
	get(app: string, id: string): Promise<BlacklistRow | undefined>;
	create(app: string, input: BlacklistInputFields, limit: BlacklistLimit): Promise<{ id: string }>;
	update(
		app: string,
		id: string,
		patch: BlacklistPatchFields,
		clear: readonly string[],
		expectedVersion: number | undefined,
		limit: BlacklistLimit,
	): Promise<{ changed: boolean; version: number }>;
	remove(app: string, id: string): Promise<void>;
	check(
		app: string,
		who: { client?: string; phone?: string; email?: string; name?: string },
	): Promise<BlacklistHitRow | null>;
	/**
	 * The gate of an online path that stores a request without a hold (the callback form): true when the visitor is to be
	 * turned away. A refusal is recorded (an event and an audit entry); anything else writes nothing.
	 */
	screen(
		app: string,
		channel: "callback" | "form" | "guide",
		contact: { name?: string; phone?: string; email?: string },
	): Promise<boolean>;
	events(
		app: string,
		query: { entry?: string; before?: number; limit?: number },
	): Promise<BlacklistEventRow[]>;
}
