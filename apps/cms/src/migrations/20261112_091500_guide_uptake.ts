import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_analytics_daily_metric" ADD VALUE 'guide_opened';
  ALTER TYPE "public"."enum_analytics_daily_metric" ADD VALUE 'guide_nudge_shown';
  ALTER TYPE "public"."enum_analytics_daily_metric" ADD VALUE 'guide_nudge_clicked';`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DELETE FROM "analytics_daily" WHERE "metric" IN ('guide_opened', 'guide_nudge_shown', 'guide_nudge_clicked');
  ALTER TABLE "analytics_daily" ALTER COLUMN "metric" SET DATA TYPE text;
  DROP TYPE "public"."enum_analytics_daily_metric";
  CREATE TYPE "public"."enum_analytics_daily_metric" AS ENUM('view', 'depth_25', 'depth_50', 'depth_75', 'depth_100', 'guide_asked', 'guide_unanswered');
  ALTER TABLE "analytics_daily" ALTER COLUMN "metric" SET DATA TYPE "public"."enum_analytics_daily_metric" USING "metric"::"public"."enum_analytics_daily_metric";`);
}
