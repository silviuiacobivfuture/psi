import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_knowledge_sources_brand" AS ENUM('psizone', 'eqsync', 'hemisync', 'blog');
  CREATE TYPE "public"."enum_knowledge_sources_language" AS ENUM('ro', 'en');
  CREATE TYPE "public"."enum_knowledge_sources_kind" AS ENUM('operational', 'programme', 'editorial', 'clinical');
  CREATE TYPE "public"."enum_knowledge_sources_sensitivity" AS ENUM('public', 'internal', 'confidential');
  CREATE TYPE "public"."enum_knowledge_sources_origin" AS ENUM('file', 'url');
  CREATE TYPE "public"."enum_knowledge_sources_status" AS ENUM('uploaded', 'awaiting_approval', 'extracting', 'chunked', 'embedding', 'indexed', 'indexed_lexical', 'private', 'rejected', 'removed', 'failed');
  CREATE TYPE "public"."enum_knowledge_sources_approval_state" AS ENUM('pending', 'approved', 'rejected');
  CREATE TABLE "knowledge_sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"brand" "enum_knowledge_sources_brand" NOT NULL,
  	"title" varchar NOT NULL,
  	"language" "enum_knowledge_sources_language" DEFAULT 'ro' NOT NULL,
  	"kind" "enum_knowledge_sources_kind" DEFAULT 'operational' NOT NULL,
  	"sensitivity" "enum_knowledge_sources_sensitivity" DEFAULT 'public' NOT NULL,
  	"downloadable" boolean DEFAULT false,
  	"audience" varchar,
  	"origin" "enum_knowledge_sources_origin" DEFAULT 'file' NOT NULL,
  	"source_url" varchar,
  	"refetch" boolean,
  	"status" "enum_knowledge_sources_status" DEFAULT 'uploaded',
  	"error" varchar,
  	"chars" numeric,
  	"section_count" numeric,
  	"chunks" numeric,
  	"indexed_at" timestamp(3) with time zone,
  	"embedder" varchar,
  	"content_hash" varchar,
  	"in_index" boolean DEFAULT true,
  	"approval_state" "enum_knowledge_sources_approval_state",
  	"approval_by" varchar,
  	"approval_by_name" varchar,
  	"approval_at" varchar,
  	"approval_hash" varchar,
  	"sections" jsonb,
  	"indexed_ids" jsonb,
  	"indexed_fingerprint" varchar,
  	"prefix" varchar DEFAULT 'knowledge',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "knowledge_sources_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "knowledge_sources_id" integer;
  ALTER TABLE "knowledge_sources_texts" ADD CONSTRAINT "knowledge_sources_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "knowledge_sources_brand_idx" ON "knowledge_sources" USING btree ("brand");
  CREATE INDEX "knowledge_sources_status_idx" ON "knowledge_sources" USING btree ("status");
  CREATE INDEX "knowledge_sources_updated_at_idx" ON "knowledge_sources" USING btree ("updated_at");
  CREATE INDEX "knowledge_sources_created_at_idx" ON "knowledge_sources" USING btree ("created_at");
  CREATE UNIQUE INDEX "knowledge_sources_filename_idx" ON "knowledge_sources" USING btree ("filename");
  CREATE INDEX "knowledge_sources_texts_order_parent" ON "knowledge_sources_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_knowledge_sources_fk" FOREIGN KEY ("knowledge_sources_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_knowledge_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("knowledge_sources_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "knowledge_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "knowledge_sources_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "knowledge_sources" CASCADE;
  DROP TABLE "knowledge_sources_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_knowledge_sources_fk";
  
  DROP INDEX "payload_locked_documents_rels_knowledge_sources_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "knowledge_sources_id";
  DROP TYPE "public"."enum_knowledge_sources_brand";
  DROP TYPE "public"."enum_knowledge_sources_language";
  DROP TYPE "public"."enum_knowledge_sources_kind";
  DROP TYPE "public"."enum_knowledge_sources_sensitivity";
  DROP TYPE "public"."enum_knowledge_sources_origin";
  DROP TYPE "public"."enum_knowledge_sources_status";
  DROP TYPE "public"."enum_knowledge_sources_approval_state";`);
}
