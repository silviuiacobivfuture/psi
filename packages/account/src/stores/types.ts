/**
 * What @psi/account keeps, as interfaces — Postgres in the cluster (`stores/postgres.ts`), memory on a workstation
 * without a database and in tests (`stores/memory.ts`). docs/plans/accounts.md §3 is the list, and it is minimal on
 * purpose: no record here holds anything clinical.
 */

/** Who signed in, as the verified ID token said. */
export interface Identity {
	issuer: string;
	/** Authentik's `sub` (`hashed_user_id`): the account key, the same on every site's provider. */
	subject: string;
	email: string | null;
	name: string | null;
}

export interface SessionRecord {
	subject: string;
	issuer: string;
	/** Authentik's session id, for back-channel logout; null when the token carried none. */
	sid: string | null;
	/** For `id_token_hint` at sign-out. */
	idToken: string;
	email: string | null;
	name: string | null;
	createdAt: number;
	lastSeenAt: number;
}

export interface SessionStore {
	create(idHash: string, record: SessionRecord): Promise<void>;
	read(idHash: string): Promise<SessionRecord | null>;
	touch(idHash: string, at: number): Promise<void>;
	remove(idHash: string): Promise<void>;
	/** Back-channel logout naming a session: every session of that Authentik session at this issuer. */
	removeBySid(issuer: string, sid: string): Promise<number>;
	/** Back-channel logout naming only a subject, and erasure. */
	removeBySubject(subject: string): Promise<number>;
}

export interface AccountRecord {
	subject: string;
	email: string | null;
	name: string | null;
	createdAt: number;
	lastSeenAt: number;
}

export interface AccountStore {
	/** Creates the account on first sign-in, links `(issuer, subject)`, refreshes e-mail and name. */
	signedIn(identity: Identity, at: number): Promise<void>;
	get(subject: string): Promise<AccountRecord | null>;
	/** The accounts holding this e-mail (as Authentik last sent it), case-insensitive; at most 20. */
	byEmail(email: string): Promise<AccountRecord[]>;
	/** Erasure: the account and, by cascade, every row that hangs off it, in one transaction. */
	erase(subject: string): Promise<void>;
}

/** The blog's reading list (the first slice). The owner column is the system of record for ownership. */
export interface SavedArticle {
	id: string;
	subject: string;
	slug: string;
	savedAt: number;
}

export interface SavedArticleStore {
	list(subject: string): Promise<SavedArticle[]>;
	/** Idempotent: saving the same slug twice keeps one row. */
	save(subject: string, slug: string, at: number): Promise<SavedArticle>;
	get(id: string): Promise<SavedArticle | null>;
	remove(id: string): Promise<void>;
}

export interface Stores {
	sessions: SessionStore;
	accounts: AccountStore;
	savedArticles: SavedArticleStore;
	profiles: ProfileStore;
	consents: ConsentStore;
	conversations: ConversationStore;
	/** Releases connections. A no-op in memory. */
	close(): Promise<void>;
}

/** The purposes a person may consent to, one by one (docs/plans/accounts.md §3). */
export const PURPOSES = ["guide_memory", "booking_contact", "programme_progress"] as const;
export type Purpose = (typeof PURPOSES)[number];

/** What a person tells us about themselves beyond what Authentik sends. Nothing clinical. */
export interface Profile {
	displayName: string | null;
	phone: string | null;
	preferredContact: "email" | "phone";
	language: "ro" | "en";
	updatedAt: number;
}

export interface ProfileStore {
	get(subject: string): Promise<Profile | null>;
	save(subject: string, profile: Omit<Profile, "updatedAt">, at: number): Promise<void>;
}

/** One grant of one purpose; a withdrawal closes it. History is kept: a new grant is a new row. */
export interface ConsentRecord {
	purpose: Purpose;
	wordingVersion: string;
	grantedAt: number;
	withdrawnAt: number | null;
}

export interface ConsentStore {
	/** Every grant, newest first. */
	list(subject: string): Promise<ConsentRecord[]>;
	current(subject: string, purpose: Purpose): Promise<boolean>;
	grant(subject: string, purpose: Purpose, wordingVersion: string, at: number): Promise<void>;
	/**
	 * Closes the open grant AND deletes what was kept under it, in the same transaction:
	 * withdrawing `guide_memory` deletes every remembered conversation.
	 */
	withdraw(subject: string, purpose: Purpose, at: number): Promise<void>;
}

/** One remembered guide conversation: one per account and site (its stable thread). */
export interface Conversation {
	id: string;
	subject: string;
	site: string;
	startedAt: number;
	updatedAt: number;
	turns: number;
}

export interface ConversationTurn {
	question: string;
	answer: string;
	at: number;
}

export interface ConversationStore {
	list(subject: string): Promise<Conversation[]>;
	get(id: string): Promise<Conversation | null>;
	/** Oldest first; at most the last `limit`. */
	turns(id: string, limit: number): Promise<ConversationTurn[]>;
	/** The site's conversation, if any. */
	forSite(subject: string, site: string): Promise<Conversation | null>;
	/** Appends one answered turn to the site's conversation, starting it if needed. */
	append(subject: string, site: string, turn: ConversationTurn): Promise<void>;
	remove(id: string): Promise<void>;
	removeAll(subject: string): Promise<void>;
}
