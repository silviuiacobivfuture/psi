import type { Sql } from "postgres";
import { z } from "zod";
import { type ConsentStore, type ConversationStore, type ProfileStore, PURPOSES } from "./types";

/**
 * The signed-in journey's tables (docs/plans/accounts.md §3): the profile, consents (the table is in
 * postgres.ts's base schema) and remembered guide conversations. Every row hangs off `account` with
 * ON DELETE CASCADE, so erasure stays one statement.
 */
export const JOURNEY_SCHEMA = [
	`CREATE TABLE IF NOT EXISTS account_profile (
		subject           text PRIMARY KEY REFERENCES account(subject) ON DELETE CASCADE,
		display_name      text,
		phone             text,
		preferred_contact text NOT NULL CHECK (preferred_contact IN ('email', 'phone')),
		language          text NOT NULL CHECK (language IN ('ro', 'en')),
		updated_at        timestamptz NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS account_conversation (
		id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		subject     text NOT NULL REFERENCES account(subject) ON DELETE CASCADE,
		site        text NOT NULL,
		started_at  timestamptz NOT NULL,
		updated_at  timestamptz NOT NULL,
		UNIQUE (subject, site)
	)`,
	`CREATE TABLE IF NOT EXISTS account_conversation_turn (
		id               bigserial PRIMARY KEY,
		conversation_id  uuid NOT NULL REFERENCES account_conversation(id) ON DELETE CASCADE,
		question         text NOT NULL,
		answer           text NOT NULL,
		at               timestamptz NOT NULL
	)`,
	"CREATE INDEX IF NOT EXISTS account_conversation_turn_by_conv ON account_conversation_turn (conversation_id, at)",
];

const ProfileRow = z.object({
	display_name: z.string().nullable(),
	phone: z.string().nullable(),
	preferred_contact: z.enum(["email", "phone"]),
	language: z.enum(["ro", "en"]),
	updated_at: z.date(),
});
const ConsentRow = z.object({
	purpose: z.enum(PURPOSES),
	wording_version: z.string(),
	granted_at: z.date(),
	withdrawn_at: z.date().nullable(),
});
const ConversationRow = z.object({
	id: z.string(),
	subject: z.string(),
	site: z.string(),
	started_at: z.date(),
	updated_at: z.date(),
	turns: z.coerce.number().int().nonnegative(),
});
const TurnRow = z.object({
	question: z.string(),
	answer: z.string(),
	at: z.date(),
});
const UUID = z.string().uuid();

const toConversation = (row: unknown) => {
	const r = ConversationRow.parse(row);
	return {
		id: r.id,
		subject: r.subject,
		site: r.site,
		startedAt: r.started_at.getTime(),
		updatedAt: r.updated_at.getTime(),
		turns: r.turns,
	};
};

const CONVERSATION_COLUMNS = `c.id::text AS id, c.subject, c.site, c.started_at, c.updated_at,
	(SELECT count(*) FROM account_conversation_turn t WHERE t.conversation_id = c.id) AS turns`;

export function journeyStores(sql: Sql): {
	profiles: ProfileStore;
	consents: ConsentStore;
	conversations: ConversationStore;
} {
	const at = (ms: number): Date => new Date(ms);
	return {
		profiles: {
			async get(subject) {
				const rows = await sql`SELECT display_name, phone, preferred_contact, language, updated_at
					FROM account_profile WHERE subject = ${subject}`;
				if (rows[0] === undefined) return null;
				const r = ProfileRow.parse(rows[0]);
				return {
					displayName: r.display_name,
					phone: r.phone,
					preferredContact: r.preferred_contact,
					language: r.language,
					updatedAt: r.updated_at.getTime(),
				};
			},
			async save(subject, p, ms) {
				await sql`INSERT INTO account_profile (subject, display_name, phone, preferred_contact, language, updated_at)
					VALUES (${subject}, ${p.displayName}, ${p.phone}, ${p.preferredContact}, ${p.language}, ${at(ms)})
					ON CONFLICT (subject) DO UPDATE SET display_name = EXCLUDED.display_name, phone = EXCLUDED.phone,
						preferred_contact = EXCLUDED.preferred_contact, language = EXCLUDED.language,
						updated_at = EXCLUDED.updated_at`;
			},
		},
		consents: {
			async list(subject) {
				const rows = await sql`SELECT purpose, wording_version, granted_at, withdrawn_at
					FROM account_consent WHERE subject = ${subject} ORDER BY granted_at DESC`;
				return rows.map((row) => {
					const r = ConsentRow.parse(row);
					return {
						purpose: r.purpose,
						wordingVersion: r.wording_version,
						grantedAt: r.granted_at.getTime(),
						withdrawnAt: r.withdrawn_at === null ? null : r.withdrawn_at.getTime(),
					};
				});
			},
			async current(subject, purpose) {
				const rows = await sql`SELECT 1 FROM account_consent
					WHERE subject = ${subject} AND purpose = ${purpose} AND withdrawn_at IS NULL LIMIT 1`;
				return rows.length > 0;
			},
			async grant(subject, purpose, version, ms) {
				await sql.begin(async (tx) => {
					const open = await tx`SELECT 1 FROM account_consent
						WHERE subject = ${subject} AND purpose = ${purpose} AND withdrawn_at IS NULL FOR UPDATE`;
					if (open.length > 0) return;
					await tx`INSERT INTO account_consent (subject, purpose, wording_version, granted_at)
						VALUES (${subject}, ${purpose}, ${version}, ${at(ms)})`;
				});
			},
			async withdraw(subject, purpose, ms) {
				await sql.begin(async (tx) => {
					await tx`UPDATE account_consent SET withdrawn_at = ${at(ms)}
						WHERE subject = ${subject} AND purpose = ${purpose} AND withdrawn_at IS NULL`;
					if (purpose === "guide_memory") {
						await tx`DELETE FROM account_conversation WHERE subject = ${subject}`;
					}
				});
			},
		},
		conversations: {
			async list(subject) {
				const rows = await sql.unsafe(
					`SELECT ${CONVERSATION_COLUMNS} FROM account_conversation c WHERE c.subject = $1 ORDER BY c.updated_at DESC`,
					[subject],
				);
				return rows.map(toConversation);
			},
			async get(id) {
				if (!UUID.safeParse(id).success) return null;
				const rows = await sql.unsafe(
					`SELECT ${CONVERSATION_COLUMNS} FROM account_conversation c WHERE c.id = $1`,
					[id],
				);
				return rows[0] === undefined ? null : toConversation(rows[0]);
			},
			async turns(id, limit) {
				if (!UUID.safeParse(id).success) return [];
				const rows = await sql`SELECT question, answer, at FROM (
					SELECT question, answer, at FROM account_conversation_turn
					WHERE conversation_id = ${id} ORDER BY at DESC LIMIT ${limit}) t ORDER BY at ASC`;
				return rows.map((row) => {
					const r = TurnRow.parse(row);
					return { question: r.question, answer: r.answer, at: r.at.getTime() };
				});
			},
			async forSite(subject, site) {
				const rows = await sql.unsafe(
					`SELECT ${CONVERSATION_COLUMNS} FROM account_conversation c WHERE c.subject = $1 AND c.site = $2`,
					[subject, site],
				);
				return rows[0] === undefined ? null : toConversation(rows[0]);
			},
			async append(subject, site, turn) {
				await sql.begin(async (tx) => {
					const rows =
						await tx`INSERT INTO account_conversation (subject, site, started_at, updated_at)
						VALUES (${subject}, ${site}, ${at(turn.at)}, ${at(turn.at)})
						ON CONFLICT (subject, site) DO UPDATE SET updated_at = EXCLUDED.updated_at
						RETURNING id::text AS id`;
					const id = z.object({ id: z.string() }).parse(rows[0]).id;
					await tx`INSERT INTO account_conversation_turn (conversation_id, question, answer, at)
						VALUES (${id}, ${turn.question}, ${turn.answer}, ${at(turn.at)})`;
				});
			},
			async remove(id) {
				if (!UUID.safeParse(id).success) return;
				await sql`DELETE FROM account_conversation WHERE id = ${id}`;
			},
			async removeAll(subject) {
				await sql`DELETE FROM account_conversation WHERE subject = ${subject}`;
			},
		},
	};
}
