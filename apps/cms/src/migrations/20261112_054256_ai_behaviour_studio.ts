import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_ai_settings_versions_brand" AS ENUM('psizone', 'eqsync', 'hemisync', 'blog');
  CREATE TYPE "public"."enum_ai_settings_versions_kind" AS ENUM('draft', 'published');
  CREATE TABLE "ai_settings_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"brand" "enum_ai_settings_versions_brand" NOT NULL,
  	"kind" "enum_ai_settings_versions_kind" NOT NULL,
  	"settings" jsonb NOT NULL,
  	"by" varchar,
  	"by_id" varchar,
  	"at" timestamp(3) with time zone NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_settings_versions_id" integer;
  ALTER TABLE "ai_settings" ADD COLUMN "psizone_behaviour" jsonb;
  ALTER TABLE "ai_settings" ADD COLUMN "eqsync_behaviour" jsonb;
  ALTER TABLE "ai_settings" ADD COLUMN "hemisync_behaviour" jsonb;
  ALTER TABLE "ai_settings" ADD COLUMN "blog_behaviour" jsonb;
  CREATE INDEX "ai_settings_versions_brand_idx" ON "ai_settings_versions" USING btree ("brand");
  CREATE INDEX "ai_settings_versions_kind_idx" ON "ai_settings_versions" USING btree ("kind");
  CREATE INDEX "ai_settings_versions_at_idx" ON "ai_settings_versions" USING btree ("at");
  CREATE INDEX "ai_settings_versions_updated_at_idx" ON "ai_settings_versions" USING btree ("updated_at");
  CREATE INDEX "ai_settings_versions_created_at_idx" ON "ai_settings_versions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_settings_versions_fk" FOREIGN KEY ("ai_settings_versions_id") REFERENCES "public"."ai_settings_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ai_settings_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_settings_versions_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "ai_settings_versions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ai_settings_versions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_settings_versions_fk";
  
  DROP INDEX "payload_locked_documents_rels_ai_settings_versions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_settings_versions_id";
  ALTER TABLE "ai_settings" DROP COLUMN "psizone_behaviour";
  ALTER TABLE "ai_settings" DROP COLUMN "eqsync_behaviour";
  ALTER TABLE "ai_settings" DROP COLUMN "hemisync_behaviour";
  ALTER TABLE "ai_settings" DROP COLUMN "blog_behaviour";
  DROP TYPE "public"."enum_ai_settings_versions_brand";
  DROP TYPE "public"."enum_ai_settings_versions_kind";`);
}
