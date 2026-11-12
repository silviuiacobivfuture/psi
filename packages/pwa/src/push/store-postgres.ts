import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { z } from "zod";
import type { NewSubscription, PlannedReminder, PushStore } from "./store";
import {
	FAILURE_LIMIT,
	LocaleSchema,
	SiteSchema,
	type SubscriptionRecord,
	TopicSchema,
} from "./types";

/**
 * The estate's push store in Postgres (docs/plans/pwa.md §Store): four `pwa_*` tables, created
 * idempotently under an advisory lock (four sites boot at once). When the account tables share
 * the database, subscriptions and booking links hang off `account(subject)` ON DELETE CASCADE,
 * so erasing an account erases its devices too.
 */
const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS pwa_subscription (
		id          uuid PRIMARY KEY,
		endpoint    text NOT NULL UNIQUE,
		p256dh      text NOT NULL,
		auth        text NOT NULL,
		site        text NOT NULL,
		locale      text NOT NULL,
		topics      text[] NOT NULL,
		subject     text,
		created_at  bigint NOT NULL,
		updated_at  bigint NOT NULL,
		failures    integer NOT NULL DEFAULT 0
	)`,
	"CREATE INDEX IF NOT EXISTS pwa_subscription_subject ON pwa_subscription (subject)",
	"CREATE INDEX IF NOT EXISTS pwa_subscription_topics ON pwa_subscription USING gin (topics)",
	`CREATE TABLE IF NOT EXISTS pwa_booking (
		reference  text PRIMARY KEY,
		subject    text NOT NULL,
		at         bigint NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS pwa_reminder (
		reference     text NOT NULL,
		lead_minutes  integer NOT NULL,
		at            bigint NOT NULL,
		PRIMARY KEY (reference, lead_minutes)
	)`,
	`CREATE TABLE IF NOT EXISTS pwa_claim (
		key  text PRIMARY KEY,
		at   bigint NOT NULL
	)`,
];

/** Added only when `account` exists in the same database. */
const CASCADES = [
	["pwa_subscription", "pwa_subscription_account_fk"],
	["pwa_booking", "pwa_booking_account_fk"],
] as const;

const MIGRATION_LOCK = 7_414_221_077;

const Row = z.object({
	id: z.string(),
	endpoint: z.string(),
	p256dh: z.string(),
	auth: z.string(),
	site: SiteSchema,
	locale: LocaleSchema,
	topics: z.array(TopicSchema),
	subject: z.string().nullable(),
	created_at: z.coerce.number(),
	updated_at: z.coerce.number(),
	failures: z.coerce.number(),
});

function record(raw: unknown): SubscriptionRecord {
	const r = Row.parse(raw);
	return {
		id: r.id,
		endpoint: r.endpoint,
		p256dh: r.p256dh,
		auth: r.auth,
		site: r.site,
		locale: r.locale,
		topics: r.topics,
		subject: r.subject,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
		failures: r.failures,
	};
}

const ReminderRow = z.object({
	reference: z.string(),
	lead_minutes: z.coerce.number(),
	at: z.coerce.number(),
});

export async function postgresPushStore(url: string): Promise<PushStore> {
	const sql = postgres(url, { max: 4, idle_timeout: 30, onnotice: () => {} });
	await sql.begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`;
		for (const statement of SCHEMA) await tx.unsafe(statement);
		const [found] = await tx`SELECT to_regclass('public.account') IS NOT NULL AS present`;
		if (z.object({ present: z.boolean() }).parse(found).present) {
			for (const [table, name] of CASCADES) {
				await tx.unsafe(
					`DO $$ BEGIN
						IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
							ALTER TABLE ${table} ADD CONSTRAINT ${name}
								FOREIGN KEY (subject) REFERENCES account(subject) ON DELETE CASCADE NOT VALID;
						END IF;
					END $$`,
				);
			}
		}
	});

	const rows = (list: ReadonlyArray<unknown>): SubscriptionRecord[] => list.map(record);

	return {
		async upsert(input: NewSubscription, at: number) {
			const topics = [...new Set(input.topics)];
			const [row] = await sql`
				INSERT INTO pwa_subscription
					(id, endpoint, p256dh, auth, site, locale, topics, subject, created_at, updated_at, failures)
				VALUES (${randomUUID()}, ${input.endpoint}, ${input.p256dh}, ${input.auth}, ${input.site},
					${input.locale}, ${topics}, ${input.subject}, ${at}, ${at}, 0)
				ON CONFLICT (endpoint) DO UPDATE SET
					p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, site = EXCLUDED.site,
					locale = EXCLUDED.locale, topics = EXCLUDED.topics, subject = EXCLUDED.subject,
					updated_at = EXCLUDED.updated_at, failures = 0
				RETURNING *`;
			return record(row);
		},
		async byEndpoint(endpoint) {
			const [row] = await sql`SELECT * FROM pwa_subscription WHERE endpoint = ${endpoint}`;
			return row === undefined ? null : record(row);
		},
		async forTopic(topic, subject) {
			if (topic === "booking") {
				if (subject === undefined) return [];
				return rows(
					await sql`SELECT * FROM pwa_subscription WHERE ${topic} = ANY(topics) AND subject = ${subject}`,
				);
			}
			return rows(await sql`SELECT * FROM pwa_subscription WHERE ${topic} = ANY(topics)`);
		},
		async forSubject(subject) {
			return rows(
				await sql`SELECT * FROM pwa_subscription WHERE subject = ${subject} ORDER BY created_at`,
			);
		},
		async bookingSubscriptions() {
			return rows(
				await sql`SELECT * FROM pwa_subscription WHERE 'booking' = ANY(topics) AND subject IS NOT NULL`,
			);
		},
		async removeEndpoint(endpoint) {
			await sql`DELETE FROM pwa_subscription WHERE endpoint = ${endpoint}`;
		},
		async removeOwned(id, subject) {
			if (!z.string().uuid().safeParse(id).success) return false;
			const gone =
				await sql`DELETE FROM pwa_subscription WHERE id = ${id} AND subject = ${subject}`;
			return gone.count > 0;
		},
		async failed(endpoint, at) {
			await sql`UPDATE pwa_subscription SET failures = failures + 1, updated_at = ${at} WHERE endpoint = ${endpoint}`;
			await sql`DELETE FROM pwa_subscription WHERE endpoint = ${endpoint} AND failures >= ${FAILURE_LIMIT}`;
		},
		async delivered(endpoint, at) {
			await sql`UPDATE pwa_subscription SET failures = 0, updated_at = ${at} WHERE endpoint = ${endpoint} AND failures > 0`;
		},
		async linkBooking(reference, subject, at) {
			await sql`
				INSERT INTO pwa_booking (reference, subject, at) VALUES (${reference}, ${subject}, ${at})
				ON CONFLICT (reference) DO UPDATE SET subject = EXCLUDED.subject, at = EXCLUDED.at`;
		},
		async bookingSubject(reference) {
			const [row] = await sql`SELECT subject FROM pwa_booking WHERE reference = ${reference}`;
			return row === undefined ? null : z.object({ subject: z.string() }).parse(row).subject;
		},
		async planReminders(reminders: ReadonlyArray<PlannedReminder>) {
			for (const r of reminders) {
				await sql`
					INSERT INTO pwa_reminder (reference, lead_minutes, at) VALUES (${r.reference}, ${r.leadMinutes}, ${r.at})
					ON CONFLICT (reference, lead_minutes) DO UPDATE SET at = EXCLUDED.at`;
			}
		},
		async cancelReminders(reference) {
			await sql`DELETE FROM pwa_reminder WHERE reference = ${reference}`;
		},
		async takeDueReminders(now) {
			const taken = await sql`DELETE FROM pwa_reminder WHERE at <= ${now} RETURNING *`;
			return taken.map((raw) => {
				const r = ReminderRow.parse(raw);
				return { reference: r.reference, leadMinutes: r.lead_minutes, at: r.at };
			});
		},
		async claim(key, at) {
			const won =
				await sql`INSERT INTO pwa_claim (key, at) VALUES (${key}, ${at}) ON CONFLICT DO NOTHING`;
			return won.count > 0;
		},
		async close() {
			await sql.end({ timeout: 5 });
		},
	};
}
