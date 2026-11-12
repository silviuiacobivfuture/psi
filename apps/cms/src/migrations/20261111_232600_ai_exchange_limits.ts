import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "ai_settings" ADD COLUMN "psizone_exchange_limit" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "psizone_exchange_window_hours" numeric DEFAULT 24 NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "eqsync_exchange_limit" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "eqsync_exchange_window_hours" numeric DEFAULT 24 NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "hemisync_exchange_limit" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "hemisync_exchange_window_hours" numeric DEFAULT 24 NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "blog_exchange_limit" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "blog_exchange_window_hours" numeric DEFAULT 24 NOT NULL;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "ai_settings" DROP COLUMN "psizone_exchange_limit";
  ALTER TABLE "ai_settings" DROP COLUMN "psizone_exchange_window_hours";
  ALTER TABLE "ai_settings" DROP COLUMN "eqsync_exchange_limit";
  ALTER TABLE "ai_settings" DROP COLUMN "eqsync_exchange_window_hours";
  ALTER TABLE "ai_settings" DROP COLUMN "hemisync_exchange_limit";
  ALTER TABLE "ai_settings" DROP COLUMN "hemisync_exchange_window_hours";
  ALTER TABLE "ai_settings" DROP COLUMN "blog_exchange_limit";
  ALTER TABLE "ai_settings" DROP COLUMN "blog_exchange_window_hours";`);
}
