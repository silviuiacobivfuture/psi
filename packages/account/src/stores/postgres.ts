import postgres from "postgres";
import { z } from "zod";
import { JOURNEY_SCHEMA, journeyStores } from "./postgres-journey";
import type { SavedArticle, SessionRecord, Stores } from "./types";

/**
 * The account database (docs/plans/accounts.md §7): one Postgres the four sites share, because they share one
 * account and an erasure must cascade through every site's rows in one transaction. Every table hangs off
 * `account` with ON DELETE CASCADE, so erasing an account is one DELETE.
 *
 * Migrations are idempotent and serialised with an advisory lock: four sites start at once.
 */
const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS account (
		subject       text PRIMARY KEY,
		email         text,
		name          text,
		created_at    timestamptz NOT NULL DEFAULT now(),
		last_seen_at  timestamptz NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS account_identity (
		issuer   text NOT NULL,
		subject  text NOT NULL REFERENCES account(subject) ON DELETE CASCADE,
		linked_at timestamptz NOT NULL DEFAULT now(),
		PRIMARY KEY (issuer, subject)
	)`,
	`CREATE TABLE IF NOT EXISTS account_session (
		id_hash       text PRIMARY KEY,
		subject       text NOT NULL REFERENCES account(subject) ON DELETE CASCADE,
		issuer        text NOT NULL,
		sid           text,
		id_token      text NOT NULL,
		email         text,
		name          text,
		created_at    timestamptz NOT NULL,
		last_seen_at  timestamptz NOT NULL
	)`,
	"CREATE INDEX IF NOT EXISTS account_session_sid ON account_session (issuer, sid)",
	"CREATE INDEX IF NOT EXISTS account_session_subject ON account_session (subject)",
	`CREATE TABLE IF NOT EXISTS account_consent (
		subject         text NOT NULL REFERENCES account(subject) ON DELETE CASCADE,
		purpose         text NOT NULL CHECK (purpose IN ('guide_memory', 'programme_progress', 'booking_contact')),
		wording_version text NOT NULL,
		granted_at      timestamptz NOT NULL,
		withdrawn_at    timestamptz,
		PRIMARY KEY (subject, purpose, granted_at)
	)`,
	`CREATE TABLE IF NOT EXISTS blog_saved_article (
		id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		subject   text NOT NULL REFERENCES account(subject) ON DELETE CASCADE,
		slug      text NOT NULL,
		saved_at  timestamptz NOT NULL DEFAULT now(),
		UNIQUE (subject, slug)
	)`,
	...JOURNEY_SCHEMA,
];

/** Any 64-bit constant: the advisory lock the four sites' migrations queue on. */
const MIGRATION_LOCK = 7_414_221_003;

const SessionRow = z.object({
	subject: z.string(),
	issuer: z.string(),
	sid: z.string().nullable(),
	id_token: z.string(),
	email: z.string().nullable(),
	name: z.string().nullable(),
	created_at: z.date(),
	last_seen_at: z.date(),
});
const AccountRow = z.object({
	subject: z.string(),
	email: z.string().nullable(),
	name: z.string().nullable(),
	created_at: z.date(),
	last_seen_at: z.date(),
});
const SavedRow = z.object({
	id: z.string(),
	subject: z.string(),
	slug: z.string(),
	saved_at: z.date(),
});

function toSaved(row: unknown): SavedArticle {
	const r = SavedRow.parse(row);
	return {
		id: r.id,
		subject: r.subject,
		slug: r.slug,
		savedAt: r.saved_at.getTime(),
	};
}

function toSession(row: unknown): SessionRecord {
	const r = SessionRow.parse(row);
	return {
		subject: r.subject,
		issuer: r.issuer,
		sid: r.sid,
		idToken: r.id_token,
		email: r.email,
		name: r.name,
		createdAt: r.created_at.getTime(),
		lastSeenAt: r.last_seen_at.getTime(),
	};
}

const UUID = z.string().uuid();

/** Connects, migrates, and returns the stores. Throws when the database is unreachable: a boot error, loud. */
export async function postgresStores(url: string): Promise<Stores> {
	const sql = postgres(url, { max: 5, idle_timeout: 30, onnotice: () => {} });
	await sql.begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`;
		for (const statement of SCHEMA) await tx.unsafe(statement);
	});
	const at = (ms: number): Date => new Date(ms);

	return {
		sessions: {
			async create(idHash, r) {
				await sql`INSERT INTO account_session (id_hash, subject, issuer, sid, id_token, email, name, created_at, last_seen_at)
					VALUES (${idHash}, ${r.subject}, ${r.issuer}, ${r.sid}, ${r.idToken}, ${r.email}, ${r.name}, ${at(r.createdAt)}, ${at(r.lastSeenAt)})`;
			},
			async read(idHash) {
				const rows =
					await sql`SELECT subject, issuer, sid, id_token, email, name, created_at, last_seen_at
					FROM account_session WHERE id_hash = ${idHash}`;
				return rows[0] === undefined ? null : toSession(rows[0]);
			},
			async touch(idHash, ms) {
				await sql`UPDATE account_session SET last_seen_at = ${at(ms)} WHERE id_hash = ${idHash}`;
			},
			async remove(idHash) {
				await sql`DELETE FROM account_session WHERE id_hash = ${idHash}`;
			},
			async removeBySid(issuer, sid) {
				return (
					await sql`DELETE FROM account_session WHERE issuer = ${issuer} AND sid = ${sid}`
				).count;
			},
			async removeBySubject(subject) {
				return (
					await sql`DELETE FROM account_session WHERE subject = ${subject}`
				).count;
			},
		},
		accounts: {
			async signedIn(identity, ms) {
				await sql.begin(async (tx) => {
					await tx`INSERT INTO account (subject, email, name, created_at, last_seen_at)
						VALUES (${identity.subject}, ${identity.email}, ${identity.name}, ${at(ms)}, ${at(ms)})
						ON CONFLICT (subject) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
							last_seen_at = EXCLUDED.last_seen_at`;
					await tx`INSERT INTO account_identity (issuer, subject) VALUES (${identity.issuer}, ${identity.subject})
						ON CONFLICT DO NOTHING`;
				});
			},
			async get(subject) {
				const rows =
					await sql`SELECT subject, email, name, created_at, last_seen_at FROM account WHERE subject = ${subject}`;
				if (rows[0] === undefined) return null;
				const r = AccountRow.parse(rows[0]);
				return {
					subject: r.subject,
					email: r.email,
					name: r.name,
					createdAt: r.created_at.getTime(),
					lastSeenAt: r.last_seen_at.getTime(),
				};
			},
			async erase(subject) {
				// Every account table hangs off `account` with ON DELETE CASCADE: one statement, one transaction.
				await sql`DELETE FROM account WHERE subject = ${subject}`;
			},
		},
		...journeyStores(sql),
		savedArticles: {
			async list(subject) {
				const rows =
					await sql`SELECT id::text AS id, subject, slug, saved_at FROM blog_saved_article
					WHERE subject = ${subject} ORDER BY saved_at DESC`;
				return rows.map(toSaved);
			},
			async save(subject, slug, ms) {
				const rows =
					await sql`INSERT INTO blog_saved_article (subject, slug, saved_at)
					VALUES (${subject}, ${slug}, ${at(ms)})
					ON CONFLICT (subject, slug) DO UPDATE SET slug = EXCLUDED.slug
					RETURNING id::text AS id, subject, slug, saved_at`;
				return toSaved(rows[0]);
			},
			async get(id) {
				if (!UUID.safeParse(id).success) return null;
				const rows =
					await sql`SELECT id::text AS id, subject, slug, saved_at FROM blog_saved_article WHERE id = ${id}`;
				return rows[0] === undefined ? null : toSaved(rows[0]);
			},
			async remove(id) {
				if (!UUID.safeParse(id).success) return;
				await sql`DELETE FROM blog_saved_article WHERE id = ${id}`;
			},
		},
		async close() {
			await sql.end({ timeout: 5 });
		},
	};
}
