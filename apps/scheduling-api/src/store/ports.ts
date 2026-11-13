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

/**
 * What the engagement layer keeps per app, by namespace: online-account invitations (`invite`, by client id), the
 * links from an account to the clients it covers (`link`, by `<account hash>/<client id>`), notification preferences
 * (`prefs`, by person or visitor), the delivery log (`delivery`, by `<day>/<job key>/<step>`) and the scheduler's claims
 * (`tick`, by `<day>/<kind>/<what>`: one scheduled notice is queued once across replicas). The service owns the shape
 * of each body (a schema parses every read); the store keeps text and a revision.
 */
export const KEYED_NAMESPACES = ["invite", "link", "prefs", "delivery", "tick"] as const;
export type KeyedNamespace = (typeof KEYED_NAMESPACES)[number];

/** The most one body holds, and the key alphabet: the store's own bounds (the Convex wrapper's too). */
export const KEYED_MAX_BODY = 16_000;
export const KEYED_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;

export interface KeyedEntry {
	key: string;
	body: string;
	revision: number;
	updatedAt: number;
}

export interface KeyedPort {
	get(app: string, ns: KeyedNamespace, key: string): Promise<KeyedEntry | undefined>;
	/**
	 * Saves `body` edited from revision `expected` (0: nothing there yet). One atomic compare-and-set:
	 * `StoreRefused("stale")` when the stored revision is another, `"invalid"` for a bad key or an oversized body,
	 * `"not_found"` for an app that is not there.
	 */
	put(
		app: string,
		ns: KeyedNamespace,
		key: string,
		expected: number,
		body: string,
	): Promise<{ revision: number; updatedAt: number }>;
	/** Entries whose key starts with `prefix`, by key, at most `limit` (default 200, at most 1000). */
	list(
		app: string,
		ns: KeyedNamespace,
		options?: { prefix?: string; limit?: number },
	): Promise<KeyedEntry[]>;
	/** False when there was nothing to remove. */
	remove(app: string, ns: KeyedNamespace, key: string): Promise<boolean>;
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

export type FeedbackGroups = readonly ("core" | "contact")[];

export interface FeedbackContactFields {
	name?: string | undefined;
	email?: string | undefined;
	phone?: string | undefined;
}

/** An item with the field groups the caller holds applied by the store: a group not asked for is absent. Text is SEALED. */
export interface FeedbackRow {
	id: string;
	kind: "appointment_rating" | "general" | "suggestion" | "complaint" | "site_issue";
	channel: "account" | "email_link" | "chat" | "staff";
	status: "new" | "read" | "answered" | "closed";
	createdAt: number;
	updatedAt: number;
	version: number;
	readAt?: number | undefined;
	answeredAt?: number | undefined;
	closedAt?: number | undefined;
	visit?: string | undefined;
	appointment?: string | undefined;
	client?: string | undefined;
	linkedAccount: boolean;
	rating?: number | undefined;
	textSealed?: string | undefined;
	consentContact?: boolean | undefined;
	contact?: FeedbackContactFields | undefined;
	staffSubject?: string | undefined;
}

export interface FeedbackReplyRow {
	id: string;
	by: string;
	at: number;
	textSealed: string;
}

export interface FeedbackFilter {
	statuses?: readonly string[] | undefined;
	kind?: string | undefined;
	channel?: string | undefined;
	from?: number | undefined;
	to?: number | undefined;
	minRating?: number | undefined;
	maxRating?: number | undefined;
	before?: number | undefined;
	limit?: number | undefined;
}

export type FeedbackLinkRefusal =
	| "invalid_link"
	| "expired"
	| "used"
	| "wrong_app"
	| "subject_gone";

/**
 * Feedback and its one-time links. Text is sealed by the service before it arrives and opened after it leaves; the
 * store never sees plain text. Refusals are `StoreRefused`: `not_found`, `stale`, `closed` (a reply to a closed item),
 * `not_closed` (reopening an open one), `too_long`, `invalid` (detail `problems`), `already_rated`, `not_eligible` (the
 * appointment is not over, was missed or cancelled), `invalid_ttl`, and for a link `invalid_link`, `expired`, `used`,
 * `wrong_app`, `subject_gone`.
 */
export interface FeedbackPort {
	list(
		app: string,
		groups: FeedbackGroups,
		filter: FeedbackFilter,
	): Promise<{ items: FeedbackRow[]; more: boolean }>;
	get(
		app: string,
		id: string,
		groups: FeedbackGroups,
	): Promise<{ item: FeedbackRow; replies: FeedbackReplyRow[] } | undefined>;
	reply(
		app: string,
		id: string,
		textSealed: string,
	): Promise<{ status: FeedbackRow["status"]; contactable: boolean; replyId: string; at: number }>;
	setStatus(
		app: string,
		id: string,
		event: "read" | "close" | "reopen",
		expectedVersion: number | undefined,
	): Promise<{ status: FeedbackRow["status"]; changed: boolean }>;
	issueLink(
		app: string,
		target: { visit?: string | undefined; appointment?: string | undefined },
		ttlHours: number | undefined,
	): Promise<{ token: string; expiresAt: number }>;
	inspectLink(app: string, token: string): Promise<{ start: number; expiresAt: number }>;
	/** Stores the feedback and uses the link up in one step: two submissions racing for one link store one. */
	redeem(
		app: string,
		token: string,
		input: {
			rating?: number | undefined;
			textSealed?: string | undefined;
			consentContact: boolean;
			contact?: FeedbackContactFields | undefined;
		},
	): Promise<{ id: string }>;
}
