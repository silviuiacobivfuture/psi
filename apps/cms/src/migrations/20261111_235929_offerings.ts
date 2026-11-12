import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_offerings_price_mode" AS ENUM('fixed', 'range', 'from', 'on_request');
  CREATE TYPE "public"."enum_offerings_price_currency" AS ENUM('RON');
  CREATE TYPE "public"."enum_offerings_brand" AS ENUM('psizone', 'eqsync', 'hemisync');
  CREATE TYPE "public"."enum_offerings_kind" AS ENUM('service', 'programme', 'protocol');
  CREATE TYPE "public"."enum_offerings_workflow_stage" AS ENUM('draft', 'in_review', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum_offerings_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_offerings_review_state" AS ENUM('pending', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum__offerings_v_version_price_mode" AS ENUM('fixed', 'range', 'from', 'on_request');
  CREATE TYPE "public"."enum__offerings_v_version_price_currency" AS ENUM('RON');
  CREATE TYPE "public"."enum__offerings_v_version_brand" AS ENUM('psizone', 'eqsync', 'hemisync');
  CREATE TYPE "public"."enum__offerings_v_version_kind" AS ENUM('service', 'programme', 'protocol');
  CREATE TYPE "public"."enum__offerings_v_version_workflow_stage" AS ENUM('draft', 'in_review', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum__offerings_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__offerings_v_published_locale" AS ENUM('ro', 'en');
  CREATE TYPE "public"."enum__offerings_v_version_review_state" AS ENUM('pending', 'changes_requested', 'approved');
  CREATE TABLE "offerings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"price_mode" "enum_offerings_price_mode" DEFAULT 'on_request',
  	"price_amount" numeric,
  	"price_from" numeric,
  	"price_to" numeric,
  	"price_currency" "enum_offerings_price_currency" DEFAULT 'RON',
  	"brand" "enum_offerings_brand",
  	"slug" varchar,
  	"kind" "enum_offerings_kind" DEFAULT 'service',
  	"valid_from" timestamp(3) with time zone,
  	"sort_order" numeric DEFAULT 0,
  	"demo" boolean DEFAULT false,
  	"workflow_stage" "enum_offerings_workflow_stage" DEFAULT 'draft',
  	"workflow_submitted_at" timestamp(3) with time zone,
  	"workflow_submitted_by_id" integer,
  	"author_user_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_offerings_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "offerings_locales" (
  	"title" varchar,
  	"summary" varchar,
  	"price_note" varchar,
  	"review_state" "enum_offerings_review_state" DEFAULT 'pending',
  	"review_reviewer_user_id" integer,
  	"review_reviewer_name" varchar,
  	"review_approved_at" timestamp(3) with time zone,
  	"review_approved_hash" varchar,
  	"review_notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_offerings_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_price_mode" "enum__offerings_v_version_price_mode" DEFAULT 'on_request',
  	"version_price_amount" numeric,
  	"version_price_from" numeric,
  	"version_price_to" numeric,
  	"version_price_currency" "enum__offerings_v_version_price_currency" DEFAULT 'RON',
  	"version_brand" "enum__offerings_v_version_brand",
  	"version_slug" varchar,
  	"version_kind" "enum__offerings_v_version_kind" DEFAULT 'service',
  	"version_valid_from" timestamp(3) with time zone,
  	"version_sort_order" numeric DEFAULT 0,
  	"version_demo" boolean DEFAULT false,
  	"version_workflow_stage" "enum__offerings_v_version_workflow_stage" DEFAULT 'draft',
  	"version_workflow_submitted_at" timestamp(3) with time zone,
  	"version_workflow_submitted_by_id" integer,
  	"version_author_user_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__offerings_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__offerings_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_offerings_v_locales" (
  	"version_title" varchar,
  	"version_summary" varchar,
  	"version_price_note" varchar,
  	"version_review_state" "enum__offerings_v_version_review_state" DEFAULT 'pending',
  	"version_review_reviewer_user_id" integer,
  	"version_review_reviewer_name" varchar,
  	"version_review_approved_at" timestamp(3) with time zone,
  	"version_review_approved_hash" varchar,
  	"version_review_notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "offerings_id" integer;
  ALTER TABLE "offerings" ADD CONSTRAINT "offerings_workflow_submitted_by_id_users_id_fk" FOREIGN KEY ("workflow_submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "offerings" ADD CONSTRAINT "offerings_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "offerings_locales" ADD CONSTRAINT "offerings_locales_review_reviewer_user_id_users_id_fk" FOREIGN KEY ("review_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "offerings_locales" ADD CONSTRAINT "offerings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."offerings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_offerings_v" ADD CONSTRAINT "_offerings_v_parent_id_offerings_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."offerings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_offerings_v" ADD CONSTRAINT "_offerings_v_version_workflow_submitted_by_id_users_id_fk" FOREIGN KEY ("version_workflow_submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_offerings_v" ADD CONSTRAINT "_offerings_v_version_author_user_id_users_id_fk" FOREIGN KEY ("version_author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_offerings_v_locales" ADD CONSTRAINT "_offerings_v_locales_version_review_reviewer_user_id_users_id_fk" FOREIGN KEY ("version_review_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_offerings_v_locales" ADD CONSTRAINT "_offerings_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_offerings_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "offerings_brand_idx" ON "offerings" USING btree ("brand");
  CREATE INDEX "offerings_slug_idx" ON "offerings" USING btree ("slug");
  CREATE INDEX "offerings_workflow_workflow_stage_idx" ON "offerings" USING btree ("workflow_stage");
  CREATE INDEX "offerings_workflow_workflow_submitted_by_idx" ON "offerings" USING btree ("workflow_submitted_by_id");
  CREATE INDEX "offerings_author_user_idx" ON "offerings" USING btree ("author_user_id");
  CREATE INDEX "offerings_updated_at_idx" ON "offerings" USING btree ("updated_at");
  CREATE INDEX "offerings_created_at_idx" ON "offerings" USING btree ("created_at");
  CREATE INDEX "offerings__status_idx" ON "offerings" USING btree ("_status");
  CREATE UNIQUE INDEX "brand_slug_idx" ON "offerings" USING btree ("brand","slug");
  CREATE INDEX "offerings_review_review_reviewer_user_idx" ON "offerings_locales" USING btree ("review_reviewer_user_id");
  CREATE UNIQUE INDEX "offerings_locales_locale_parent_id_unique" ON "offerings_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "offerings_locales_parent_id_idx" ON "offerings_locales" USING btree ("_parent_id");
  CREATE INDEX "_offerings_v_parent_idx" ON "_offerings_v" USING btree ("parent_id");
  CREATE INDEX "_offerings_v_version_version_brand_idx" ON "_offerings_v" USING btree ("version_brand");
  CREATE INDEX "_offerings_v_version_version_slug_idx" ON "_offerings_v" USING btree ("version_slug");
  CREATE INDEX "_offerings_v_version_workflow_version_workflow_stage_idx" ON "_offerings_v" USING btree ("version_workflow_stage");
  CREATE INDEX "_offerings_v_version_workflow_version_workflow_submitted_idx" ON "_offerings_v" USING btree ("version_workflow_submitted_by_id");
  CREATE INDEX "_offerings_v_version_version_author_user_idx" ON "_offerings_v" USING btree ("version_author_user_id");
  CREATE INDEX "_offerings_v_version_version_updated_at_idx" ON "_offerings_v" USING btree ("version_updated_at");
  CREATE INDEX "_offerings_v_version_version_created_at_idx" ON "_offerings_v" USING btree ("version_created_at");
  CREATE INDEX "_offerings_v_version_version__status_idx" ON "_offerings_v" USING btree ("version__status");
  CREATE INDEX "_offerings_v_created_at_idx" ON "_offerings_v" USING btree ("created_at");
  CREATE INDEX "_offerings_v_updated_at_idx" ON "_offerings_v" USING btree ("updated_at");
  CREATE INDEX "_offerings_v_snapshot_idx" ON "_offerings_v" USING btree ("snapshot");
  CREATE INDEX "_offerings_v_published_locale_idx" ON "_offerings_v" USING btree ("published_locale");
  CREATE INDEX "_offerings_v_latest_idx" ON "_offerings_v" USING btree ("latest");
  CREATE INDEX "_offerings_v_autosave_idx" ON "_offerings_v" USING btree ("autosave");
  CREATE INDEX "version_brand_version_slug_idx" ON "_offerings_v" USING btree ("version_brand","version_slug");
  CREATE INDEX "_offerings_v_version_review_version_review_reviewer_user_idx" ON "_offerings_v_locales" USING btree ("version_review_reviewer_user_id");
  CREATE UNIQUE INDEX "_offerings_v_locales_locale_parent_id_unique" ON "_offerings_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_offerings_v_locales_parent_id_idx" ON "_offerings_v_locales" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_offerings_fk" FOREIGN KEY ("offerings_id") REFERENCES "public"."offerings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_offerings_id_idx" ON "payload_locked_documents_rels" USING btree ("offerings_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "offerings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "offerings_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_offerings_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_offerings_v_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "offerings" CASCADE;
  DROP TABLE "offerings_locales" CASCADE;
  DROP TABLE "_offerings_v" CASCADE;
  DROP TABLE "_offerings_v_locales" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_offerings_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_offerings_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "offerings_id";
  DROP TYPE "public"."enum_offerings_price_mode";
  DROP TYPE "public"."enum_offerings_price_currency";
  DROP TYPE "public"."enum_offerings_brand";
  DROP TYPE "public"."enum_offerings_kind";
  DROP TYPE "public"."enum_offerings_workflow_stage";
  DROP TYPE "public"."enum_offerings_status";
  DROP TYPE "public"."enum_offerings_review_state";
  DROP TYPE "public"."enum__offerings_v_version_price_mode";
  DROP TYPE "public"."enum__offerings_v_version_price_currency";
  DROP TYPE "public"."enum__offerings_v_version_brand";
  DROP TYPE "public"."enum__offerings_v_version_kind";
  DROP TYPE "public"."enum__offerings_v_version_workflow_stage";
  DROP TYPE "public"."enum__offerings_v_version_status";
  DROP TYPE "public"."enum__offerings_v_published_locale";
  DROP TYPE "public"."enum__offerings_v_version_review_state";`);
}
