import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_ai_settings_psizone_screening_level" AS ENUM('standard', 'strict');
  CREATE TYPE "public"."enum_ai_settings_eqsync_screening_level" AS ENUM('standard', 'strict');
  CREATE TYPE "public"."enum_ai_settings_hemisync_screening_level" AS ENUM('standard', 'strict');
  CREATE TYPE "public"."enum_ai_settings_blog_screening_level" AS ENUM('standard', 'strict');
  ALTER TABLE "ai_settings" ADD COLUMN "psizone_screening_level" "enum_ai_settings_psizone_screening_level" DEFAULT 'standard' NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "eqsync_screening_level" "enum_ai_settings_eqsync_screening_level" DEFAULT 'standard' NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "hemisync_screening_level" "enum_ai_settings_hemisync_screening_level" DEFAULT 'standard' NOT NULL;
  ALTER TABLE "ai_settings" ADD COLUMN "blog_screening_level" "enum_ai_settings_blog_screening_level" DEFAULT 'standard' NOT NULL;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "ai_settings" DROP COLUMN "psizone_screening_level";
  ALTER TABLE "ai_settings" DROP COLUMN "eqsync_screening_level";
  ALTER TABLE "ai_settings" DROP COLUMN "hemisync_screening_level";
  ALTER TABLE "ai_settings" DROP COLUMN "blog_screening_level";
  DROP TYPE "public"."enum_ai_settings_psizone_screening_level";
  DROP TYPE "public"."enum_ai_settings_eqsync_screening_level";
  DROP TYPE "public"."enum_ai_settings_hemisync_screening_level";
  DROP TYPE "public"."enum_ai_settings_blog_screening_level";`);
}
