import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_articles_workflow_stage" AS ENUM('draft', 'in_review', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum_articles_review_state" AS ENUM('pending', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum__articles_v_version_brand" AS ENUM('psizone', 'eqsync', 'hemisync');
  CREATE TYPE "public"."enum__articles_v_version_topic" AS ENUM('autism', 'adhd', 'adolescenti', 'integrare-senzoriala', 'logopedie', 'qeeg', 'anxietate-depresie', 'editorial', 'cum-lucram', 'programul-eqsync', 'explorarea-constiintei');
  CREATE TYPE "public"."enum__articles_v_version_kind" AS ENUM('health', 'editorial');
  CREATE TYPE "public"."enum__articles_v_version_workflow_stage" AS ENUM('draft', 'in_review', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_published_locale" AS ENUM('ro', 'en');
  CREATE TYPE "public"."enum__articles_v_version_review_state" AS ENUM('pending', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum_knowledge_entries_brand" AS ENUM('psizone', 'eqsync', 'hemisync', 'blog');
  CREATE TYPE "public"."enum_knowledge_entries_kind" AS ENUM('clinical', 'programme', 'operational', 'editorial');
  CREATE TYPE "public"."enum_knowledge_entries_workflow_stage" AS ENUM('draft', 'in_review', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum_knowledge_entries_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_knowledge_entries_review_state" AS ENUM('pending', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum__knowledge_entries_v_version_brand" AS ENUM('psizone', 'eqsync', 'hemisync', 'blog');
  CREATE TYPE "public"."enum__knowledge_entries_v_version_kind" AS ENUM('clinical', 'programme', 'operational', 'editorial');
  CREATE TYPE "public"."enum__knowledge_entries_v_version_workflow_stage" AS ENUM('draft', 'in_review', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum__knowledge_entries_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__knowledge_entries_v_published_locale" AS ENUM('ro', 'en');
  CREATE TYPE "public"."enum__knowledge_entries_v_version_review_state" AS ENUM('pending', 'changes_requested', 'approved');
  CREATE TYPE "public"."enum_review_events_action" AS ENUM('submit', 'approve', 'reject', 'publish', 'unpublish', 'invalidate', 'delete');
  CREATE TYPE "public"."enum_analytics_daily_metric" AS ENUM('view', 'depth_25', 'depth_50', 'depth_75', 'depth_100', 'guide_asked', 'guide_unanswered');
  CREATE TYPE "public"."enum_ai_settings_psizone_embeddings" AS ENUM('openrouter', 'lexical');
  CREATE TYPE "public"."enum_ai_settings_psizone_embed_model" AS ENUM('openai/text-embedding-3-small', 'openai/text-embedding-3-large');
  CREATE TYPE "public"."enum_ai_settings_eqsync_embeddings" AS ENUM('openrouter', 'lexical');
  CREATE TYPE "public"."enum_ai_settings_eqsync_embed_model" AS ENUM('openai/text-embedding-3-small', 'openai/text-embedding-3-large');
  CREATE TYPE "public"."enum_ai_settings_hemisync_embeddings" AS ENUM('openrouter', 'lexical');
  CREATE TYPE "public"."enum_ai_settings_hemisync_embed_model" AS ENUM('openai/text-embedding-3-small', 'openai/text-embedding-3-large');
  CREATE TYPE "public"."enum_ai_settings_blog_embeddings" AS ENUM('openrouter', 'lexical');
  CREATE TYPE "public"."enum_ai_settings_blog_embed_model" AS ENUM('openai/text-embedding-3-small', 'openai/text-embedding-3-large');
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'cum-lucram';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'programul-eqsync';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'explorarea-constiintei';
  CREATE TABLE "articles_provenance" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"entry" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_p" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_p_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_blocks_h2" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_h2_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_blocks_quote" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_quote_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_blocks_list_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_blocks_list_items_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_blocks_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_articles_v_version_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_sources_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_version_provenance" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"entry" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_cover_id" integer,
  	"version_ai_drafted" boolean DEFAULT false,
  	"version_author_id" integer,
  	"version_reviewer_id" integer,
  	"version_reviewed_at" timestamp(3) with time zone,
  	"version_slug" varchar,
  	"version_brand" "enum__articles_v_version_brand",
  	"version_topic" "enum__articles_v_version_topic",
  	"version_kind" "enum__articles_v_version_kind" DEFAULT 'health',
  	"version_backlog_no" numeric,
  	"version_published_at" timestamp(3) with time zone,
  	"version_workflow_stage" "enum__articles_v_version_workflow_stage" DEFAULT 'draft',
  	"version_workflow_submitted_at" timestamp(3) with time zone,
  	"version_workflow_submitted_by_id" integer,
  	"version_author_user_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__articles_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_articles_v_locales" (
  	"version_title" varchar,
  	"version_standfirst" varchar,
  	"version_author_team" varchar,
  	"version_review_state" "enum__articles_v_version_review_state" DEFAULT 'pending',
  	"version_review_reviewer_user_id" integer,
  	"version_review_reviewer_name" varchar,
  	"version_review_approved_at" timestamp(3) with time zone,
  	"version_review_approved_hash" varchar,
  	"version_review_notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "knowledge_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"brand" "enum_knowledge_entries_brand",
  	"kind" "enum_knowledge_entries_kind" DEFAULT 'clinical',
  	"audience" varchar,
  	"hub" varchar,
  	"method" varchar,
  	"workflow_stage" "enum_knowledge_entries_workflow_stage" DEFAULT 'draft',
  	"workflow_submitted_at" timestamp(3) with time zone,
  	"workflow_submitted_by_id" integer,
  	"author_user_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_knowledge_entries_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "knowledge_entries_locales" (
  	"question" varchar,
  	"slug" varchar,
  	"answer" varchar,
  	"cite_path" varchar,
  	"review_state" "enum_knowledge_entries_review_state" DEFAULT 'pending',
  	"review_reviewer_user_id" integer,
  	"review_reviewer_name" varchar,
  	"review_approved_at" timestamp(3) with time zone,
  	"review_approved_hash" varchar,
  	"review_notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_knowledge_entries_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_brand" "enum__knowledge_entries_v_version_brand",
  	"version_kind" "enum__knowledge_entries_v_version_kind" DEFAULT 'clinical',
  	"version_audience" varchar,
  	"version_hub" varchar,
  	"version_method" varchar,
  	"version_workflow_stage" "enum__knowledge_entries_v_version_workflow_stage" DEFAULT 'draft',
  	"version_workflow_submitted_at" timestamp(3) with time zone,
  	"version_workflow_submitted_by_id" integer,
  	"version_author_user_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__knowledge_entries_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__knowledge_entries_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_knowledge_entries_v_locales" (
  	"version_question" varchar,
  	"version_slug" varchar,
  	"version_answer" varchar,
  	"version_cite_path" varchar,
  	"version_review_state" "enum__knowledge_entries_v_version_review_state" DEFAULT 'pending',
  	"version_review_reviewer_user_id" integer,
  	"version_review_reviewer_name" varchar,
  	"version_review_approved_at" timestamp(3) with time zone,
  	"version_review_approved_hash" varchar,
  	"version_review_notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "review_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"collection_slug" varchar NOT NULL,
  	"document_id" varchar NOT NULL,
  	"brand" varchar,
  	"title" varchar,
  	"locale" varchar,
  	"action" "enum_review_events_action" NOT NULL,
  	"actor_id" integer,
  	"authorizer" varchar,
  	"content_hash" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analytics_daily" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar NOT NULL,
  	"brand" varchar NOT NULL,
  	"slug" varchar DEFAULT '' NOT NULL,
  	"locale" varchar NOT NULL,
  	"topic" varchar DEFAULT '' NOT NULL,
  	"metric" "enum_analytics_daily_metric" NOT NULL,
  	"count" numeric DEFAULT 0 NOT NULL
  );
  
  CREATE TABLE "users_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "ai_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"psizone_embeddings" "enum_ai_settings_psizone_embeddings" DEFAULT 'openrouter' NOT NULL,
  	"psizone_embed_model" "enum_ai_settings_psizone_embed_model" DEFAULT 'openai/text-embedding-3-small' NOT NULL,
  	"psizone_deep_search" boolean DEFAULT false,
  	"psizone_guide_enabled" boolean DEFAULT true,
  	"psizone_updated_by" varchar,
  	"psizone_updated_at" timestamp(3) with time zone,
  	"eqsync_embeddings" "enum_ai_settings_eqsync_embeddings" DEFAULT 'openrouter' NOT NULL,
  	"eqsync_embed_model" "enum_ai_settings_eqsync_embed_model" DEFAULT 'openai/text-embedding-3-small' NOT NULL,
  	"eqsync_deep_search" boolean DEFAULT false,
  	"eqsync_guide_enabled" boolean DEFAULT true,
  	"eqsync_updated_by" varchar,
  	"eqsync_updated_at" timestamp(3) with time zone,
  	"hemisync_embeddings" "enum_ai_settings_hemisync_embeddings" DEFAULT 'openrouter' NOT NULL,
  	"hemisync_embed_model" "enum_ai_settings_hemisync_embed_model" DEFAULT 'openai/text-embedding-3-small' NOT NULL,
  	"hemisync_deep_search" boolean DEFAULT false,
  	"hemisync_guide_enabled" boolean DEFAULT true,
  	"hemisync_updated_by" varchar,
  	"hemisync_updated_at" timestamp(3) with time zone,
  	"blog_embeddings" "enum_ai_settings_blog_embeddings" DEFAULT 'openrouter' NOT NULL,
  	"blog_embed_model" "enum_ai_settings_blog_embed_model" DEFAULT 'openai/text-embedding-3-small' NOT NULL,
  	"blog_deep_search" boolean DEFAULT false,
  	"blog_guide_enabled" boolean DEFAULT true,
  	"blog_updated_by" varchar,
  	"blog_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  -- Hand-edited: upstream's single "status" (in-review | published) becomes Payload's drafts
  -- "_status" (draft | published), keeping what was published published. Both enums are named
  -- enum_articles_status, so the generated order (alter before add) could not run.
  ALTER TABLE "articles" ADD COLUMN "_status" text DEFAULT 'draft';
  UPDATE "articles" SET "_status" = CASE WHEN "status"::text = 'published' THEN 'published' ELSE 'draft' END;
  ALTER TABLE "articles" DROP COLUMN "status";
  DROP TYPE "public"."enum_articles_status";
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  ALTER TABLE "articles" ALTER COLUMN "_status" SET DEFAULT 'draft'::"public"."enum_articles_status";
  ALTER TABLE "articles" ALTER COLUMN "_status" SET DATA TYPE "public"."enum_articles_status" USING "_status"::"public"."enum_articles_status";
  ALTER TABLE "articles_blocks_p_locales" ALTER COLUMN "text" DROP NOT NULL;
  ALTER TABLE "articles_blocks_h2_locales" ALTER COLUMN "text" DROP NOT NULL;
  ALTER TABLE "articles_blocks_quote_locales" ALTER COLUMN "text" DROP NOT NULL;
  ALTER TABLE "articles_blocks_list_items_locales" ALTER COLUMN "text" DROP NOT NULL;
  ALTER TABLE "articles_sources" ALTER COLUMN "href" DROP NOT NULL;
  ALTER TABLE "articles_sources_locales" ALTER COLUMN "label" DROP NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "slug" DROP NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "brand" DROP NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "topic" DROP NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "kind" SET DEFAULT 'health';
  ALTER TABLE "articles_locales" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "articles" ADD COLUMN "cover_id" integer;
  ALTER TABLE "articles" ADD COLUMN "ai_drafted" boolean DEFAULT false;
  ALTER TABLE "articles" ADD COLUMN "workflow_stage" "enum_articles_workflow_stage" DEFAULT 'draft';
  ALTER TABLE "articles" ADD COLUMN "workflow_submitted_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "workflow_submitted_by_id" integer;
  ALTER TABLE "articles" ADD COLUMN "author_user_id" integer;
  ALTER TABLE "articles_locales" ADD COLUMN "review_state" "enum_articles_review_state" DEFAULT 'pending';
  ALTER TABLE "articles_locales" ADD COLUMN "review_reviewer_user_id" integer;
  ALTER TABLE "articles_locales" ADD COLUMN "review_reviewer_name" varchar;
  ALTER TABLE "articles_locales" ADD COLUMN "review_approved_at" timestamp(3) with time zone;
  ALTER TABLE "articles_locales" ADD COLUMN "review_approved_hash" varchar;
  ALTER TABLE "articles_locales" ADD COLUMN "review_notes" varchar;
  ALTER TABLE "people" ADD COLUMN "user_id" integer;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_filename" varchar;
  ALTER TABLE "users" ADD COLUMN "enable_a_p_i_key" boolean;
  ALTER TABLE "users" ADD COLUMN "api_key" varchar;
  ALTER TABLE "users" ADD COLUMN "api_key_index" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "knowledge_entries_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "review_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "analytics_daily_id" integer;
  ALTER TABLE "articles_provenance" ADD CONSTRAINT "articles_provenance_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_p" ADD CONSTRAINT "_articles_v_blocks_p_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_p_locales" ADD CONSTRAINT "_articles_v_blocks_p_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_blocks_p"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_h2" ADD CONSTRAINT "_articles_v_blocks_h2_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_h2_locales" ADD CONSTRAINT "_articles_v_blocks_h2_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_blocks_h2"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_quote" ADD CONSTRAINT "_articles_v_blocks_quote_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_quote_locales" ADD CONSTRAINT "_articles_v_blocks_quote_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_blocks_quote"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_list_items" ADD CONSTRAINT "_articles_v_blocks_list_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_blocks_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_list_items_locales" ADD CONSTRAINT "_articles_v_blocks_list_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_blocks_list_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_blocks_list" ADD CONSTRAINT "_articles_v_blocks_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_sources" ADD CONSTRAINT "_articles_v_version_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_sources_locales" ADD CONSTRAINT "_articles_v_version_sources_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_version_sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_provenance" ADD CONSTRAINT "_articles_v_version_provenance_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_cover_id_media_id_fk" FOREIGN KEY ("version_cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_author_id_people_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_reviewer_id_people_id_fk" FOREIGN KEY ("version_reviewer_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_workflow_submitted_by_id_users_id_fk" FOREIGN KEY ("version_workflow_submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_author_user_id_users_id_fk" FOREIGN KEY ("version_author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_locales" ADD CONSTRAINT "_articles_v_locales_version_review_reviewer_user_id_users_id_fk" FOREIGN KEY ("version_review_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_locales" ADD CONSTRAINT "_articles_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_workflow_submitted_by_id_users_id_fk" FOREIGN KEY ("workflow_submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "knowledge_entries_locales" ADD CONSTRAINT "knowledge_entries_locales_review_reviewer_user_id_users_id_fk" FOREIGN KEY ("review_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "knowledge_entries_locales" ADD CONSTRAINT "knowledge_entries_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_knowledge_entries_v" ADD CONSTRAINT "_knowledge_entries_v_parent_id_knowledge_entries_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_knowledge_entries_v" ADD CONSTRAINT "_knowledge_entries_v_version_workflow_submitted_by_id_users_id_fk" FOREIGN KEY ("version_workflow_submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_knowledge_entries_v" ADD CONSTRAINT "_knowledge_entries_v_version_author_user_id_users_id_fk" FOREIGN KEY ("version_author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_knowledge_entries_v_locales" ADD CONSTRAINT "_knowledge_entries_v_locales_version_review_reviewer_user_id_users_id_fk" FOREIGN KEY ("version_review_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_knowledge_entries_v_locales" ADD CONSTRAINT "_knowledge_entries_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_knowledge_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "review_events" ADD CONSTRAINT "review_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_texts" ADD CONSTRAINT "users_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_provenance_order_idx" ON "articles_provenance" USING btree ("_order");
  CREATE INDEX "articles_provenance_parent_id_idx" ON "articles_provenance" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_p_order_idx" ON "_articles_v_blocks_p" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_p_parent_id_idx" ON "_articles_v_blocks_p" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_p_path_idx" ON "_articles_v_blocks_p" USING btree ("_path");
  CREATE UNIQUE INDEX "_articles_v_blocks_p_locales_locale_parent_id_unique" ON "_articles_v_blocks_p_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_blocks_p_locales_parent_id_idx" ON "_articles_v_blocks_p_locales" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_h2_order_idx" ON "_articles_v_blocks_h2" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_h2_parent_id_idx" ON "_articles_v_blocks_h2" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_h2_path_idx" ON "_articles_v_blocks_h2" USING btree ("_path");
  CREATE UNIQUE INDEX "_articles_v_blocks_h2_locales_locale_parent_id_unique" ON "_articles_v_blocks_h2_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_blocks_h2_locales_parent_id_idx" ON "_articles_v_blocks_h2_locales" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_quote_order_idx" ON "_articles_v_blocks_quote" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_quote_parent_id_idx" ON "_articles_v_blocks_quote" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_quote_path_idx" ON "_articles_v_blocks_quote" USING btree ("_path");
  CREATE UNIQUE INDEX "_articles_v_blocks_quote_locales_locale_parent_id_unique" ON "_articles_v_blocks_quote_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_blocks_quote_locales_parent_id_idx" ON "_articles_v_blocks_quote_locales" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_list_items_order_idx" ON "_articles_v_blocks_list_items" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_list_items_parent_id_idx" ON "_articles_v_blocks_list_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_articles_v_blocks_list_items_locales_locale_parent_id_uniqu" ON "_articles_v_blocks_list_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_blocks_list_items_locales_parent_id_idx" ON "_articles_v_blocks_list_items_locales" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_list_order_idx" ON "_articles_v_blocks_list" USING btree ("_order");
  CREATE INDEX "_articles_v_blocks_list_parent_id_idx" ON "_articles_v_blocks_list" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_blocks_list_path_idx" ON "_articles_v_blocks_list" USING btree ("_path");
  CREATE INDEX "_articles_v_version_sources_order_idx" ON "_articles_v_version_sources" USING btree ("_order");
  CREATE INDEX "_articles_v_version_sources_parent_id_idx" ON "_articles_v_version_sources" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_articles_v_version_sources_locales_locale_parent_id_unique" ON "_articles_v_version_sources_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_version_sources_locales_parent_id_idx" ON "_articles_v_version_sources_locales" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_provenance_order_idx" ON "_articles_v_version_provenance" USING btree ("_order");
  CREATE INDEX "_articles_v_version_provenance_parent_id_idx" ON "_articles_v_version_provenance" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_cover_idx" ON "_articles_v" USING btree ("version_cover_id");
  CREATE INDEX "_articles_v_version_version_author_idx" ON "_articles_v" USING btree ("version_author_id");
  CREATE INDEX "_articles_v_version_version_reviewer_idx" ON "_articles_v" USING btree ("version_reviewer_id");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_brand_idx" ON "_articles_v" USING btree ("version_brand");
  CREATE INDEX "_articles_v_version_workflow_version_workflow_stage_idx" ON "_articles_v" USING btree ("version_workflow_stage");
  CREATE INDEX "_articles_v_version_workflow_version_workflow_submitted__idx" ON "_articles_v" USING btree ("version_workflow_submitted_by_id");
  CREATE INDEX "_articles_v_version_version_author_user_idx" ON "_articles_v" USING btree ("version_author_user_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_snapshot_idx" ON "_articles_v" USING btree ("snapshot");
  CREATE INDEX "_articles_v_published_locale_idx" ON "_articles_v" USING btree ("published_locale");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_autosave_idx" ON "_articles_v" USING btree ("autosave");
  CREATE INDEX "_articles_v_version_review_version_review_reviewer_user_idx" ON "_articles_v_locales" USING btree ("version_review_reviewer_user_id");
  CREATE UNIQUE INDEX "_articles_v_locales_locale_parent_id_unique" ON "_articles_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_locales_parent_id_idx" ON "_articles_v_locales" USING btree ("_parent_id");
  CREATE INDEX "knowledge_entries_brand_idx" ON "knowledge_entries" USING btree ("brand");
  CREATE INDEX "knowledge_entries_workflow_workflow_stage_idx" ON "knowledge_entries" USING btree ("workflow_stage");
  CREATE INDEX "knowledge_entries_workflow_workflow_submitted_by_idx" ON "knowledge_entries" USING btree ("workflow_submitted_by_id");
  CREATE INDEX "knowledge_entries_author_user_idx" ON "knowledge_entries" USING btree ("author_user_id");
  CREATE INDEX "knowledge_entries_updated_at_idx" ON "knowledge_entries" USING btree ("updated_at");
  CREATE INDEX "knowledge_entries_created_at_idx" ON "knowledge_entries" USING btree ("created_at");
  CREATE INDEX "knowledge_entries__status_idx" ON "knowledge_entries" USING btree ("_status");
  CREATE INDEX "knowledge_entries_review_review_reviewer_user_idx" ON "knowledge_entries_locales" USING btree ("review_reviewer_user_id");
  CREATE UNIQUE INDEX "knowledge_entries_locales_locale_parent_id_unique" ON "knowledge_entries_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "knowledge_entries_locales_parent_id_idx" ON "knowledge_entries_locales" USING btree ("_parent_id");
  CREATE INDEX "_knowledge_entries_v_parent_idx" ON "_knowledge_entries_v" USING btree ("parent_id");
  CREATE INDEX "_knowledge_entries_v_version_version_brand_idx" ON "_knowledge_entries_v" USING btree ("version_brand");
  CREATE INDEX "_knowledge_entries_v_version_workflow_version_workflow_s_idx" ON "_knowledge_entries_v" USING btree ("version_workflow_stage");
  CREATE INDEX "_knowledge_entries_v_version_workflow_version_workflow_1_idx" ON "_knowledge_entries_v" USING btree ("version_workflow_submitted_by_id");
  CREATE INDEX "_knowledge_entries_v_version_version_author_user_idx" ON "_knowledge_entries_v" USING btree ("version_author_user_id");
  CREATE INDEX "_knowledge_entries_v_version_version_updated_at_idx" ON "_knowledge_entries_v" USING btree ("version_updated_at");
  CREATE INDEX "_knowledge_entries_v_version_version_created_at_idx" ON "_knowledge_entries_v" USING btree ("version_created_at");
  CREATE INDEX "_knowledge_entries_v_version_version__status_idx" ON "_knowledge_entries_v" USING btree ("version__status");
  CREATE INDEX "_knowledge_entries_v_created_at_idx" ON "_knowledge_entries_v" USING btree ("created_at");
  CREATE INDEX "_knowledge_entries_v_updated_at_idx" ON "_knowledge_entries_v" USING btree ("updated_at");
  CREATE INDEX "_knowledge_entries_v_snapshot_idx" ON "_knowledge_entries_v" USING btree ("snapshot");
  CREATE INDEX "_knowledge_entries_v_published_locale_idx" ON "_knowledge_entries_v" USING btree ("published_locale");
  CREATE INDEX "_knowledge_entries_v_latest_idx" ON "_knowledge_entries_v" USING btree ("latest");
  CREATE INDEX "_knowledge_entries_v_version_review_version_review_revie_idx" ON "_knowledge_entries_v_locales" USING btree ("version_review_reviewer_user_id");
  CREATE UNIQUE INDEX "_knowledge_entries_v_locales_locale_parent_id_unique" ON "_knowledge_entries_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_knowledge_entries_v_locales_parent_id_idx" ON "_knowledge_entries_v_locales" USING btree ("_parent_id");
  CREATE INDEX "review_events_document_id_idx" ON "review_events" USING btree ("document_id");
  CREATE INDEX "review_events_brand_idx" ON "review_events" USING btree ("brand");
  CREATE INDEX "review_events_actor_idx" ON "review_events" USING btree ("actor_id");
  CREATE INDEX "review_events_updated_at_idx" ON "review_events" USING btree ("updated_at");
  CREATE INDEX "review_events_created_at_idx" ON "review_events" USING btree ("created_at");
  CREATE INDEX "analytics_daily_day_idx" ON "analytics_daily" USING btree ("day");
  CREATE INDEX "analytics_daily_brand_idx" ON "analytics_daily" USING btree ("brand");
  CREATE UNIQUE INDEX "day_brand_slug_locale_topic_metric_idx" ON "analytics_daily" USING btree ("day","brand","slug","locale","topic","metric");
  CREATE INDEX "users_texts_order_parent" ON "users_texts" USING btree ("order","parent_id");
  ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_workflow_submitted_by_id_users_id_fk" FOREIGN KEY ("workflow_submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_locales" ADD CONSTRAINT "articles_locales_review_reviewer_user_id_users_id_fk" FOREIGN KEY ("review_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_knowledge_entries_fk" FOREIGN KEY ("knowledge_entries_id") REFERENCES "public"."knowledge_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_review_events_fk" FOREIGN KEY ("review_events_id") REFERENCES "public"."review_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analytics_daily_fk" FOREIGN KEY ("analytics_daily_id") REFERENCES "public"."analytics_daily"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_cover_idx" ON "articles" USING btree ("cover_id");
  CREATE INDEX "articles_brand_idx" ON "articles" USING btree ("brand");
  CREATE INDEX "articles_workflow_workflow_stage_idx" ON "articles" USING btree ("workflow_stage");
  CREATE INDEX "articles_workflow_workflow_submitted_by_idx" ON "articles" USING btree ("workflow_submitted_by_id");
  CREATE INDEX "articles_author_user_idx" ON "articles" USING btree ("author_user_id");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE INDEX "articles_review_review_reviewer_user_idx" ON "articles_locales" USING btree ("review_reviewer_user_id");
  CREATE UNIQUE INDEX "people_user_idx" ON "people" USING btree ("user_id");
  CREATE INDEX "media_sizes_thumb_sizes_thumb_filename_idx" ON "media" USING btree ("sizes_thumb_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE INDEX "payload_locked_documents_rels_knowledge_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("knowledge_entries_id");
  CREATE INDEX "payload_locked_documents_rels_review_events_id_idx" ON "payload_locked_documents_rels" USING btree ("review_events_id");
  CREATE INDEX "payload_locked_documents_rels_analytics_daily_id_idx" ON "payload_locked_documents_rels" USING btree ("analytics_daily_id");
`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "articles_provenance" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_p" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_p_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_h2" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_h2_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_quote" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_quote_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_list_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_list_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_blocks_list" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_version_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_version_sources_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_version_provenance" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "knowledge_entries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "knowledge_entries_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_knowledge_entries_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_knowledge_entries_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "review_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "analytics_daily" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "users_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "articles_provenance" CASCADE;
  DROP TABLE "_articles_v_blocks_p" CASCADE;
  DROP TABLE "_articles_v_blocks_p_locales" CASCADE;
  DROP TABLE "_articles_v_blocks_h2" CASCADE;
  DROP TABLE "_articles_v_blocks_h2_locales" CASCADE;
  DROP TABLE "_articles_v_blocks_quote" CASCADE;
  DROP TABLE "_articles_v_blocks_quote_locales" CASCADE;
  DROP TABLE "_articles_v_blocks_list_items" CASCADE;
  DROP TABLE "_articles_v_blocks_list_items_locales" CASCADE;
  DROP TABLE "_articles_v_blocks_list" CASCADE;
  DROP TABLE "_articles_v_version_sources" CASCADE;
  DROP TABLE "_articles_v_version_sources_locales" CASCADE;
  DROP TABLE "_articles_v_version_provenance" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_locales" CASCADE;
  DROP TABLE "knowledge_entries" CASCADE;
  DROP TABLE "knowledge_entries_locales" CASCADE;
  DROP TABLE "_knowledge_entries_v" CASCADE;
  DROP TABLE "_knowledge_entries_v_locales" CASCADE;
  DROP TABLE "review_events" CASCADE;
  DROP TABLE "analytics_daily" CASCADE;
  DROP TABLE "users_texts" CASCADE;
  DROP TABLE "ai_settings" CASCADE;
  ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_cover_id_media_id_fk";
  
  ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_workflow_submitted_by_id_users_id_fk";
  
  ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_author_user_id_users_id_fk";
  
  ALTER TABLE "articles_locales" DROP CONSTRAINT IF EXISTS "articles_locales_review_reviewer_user_id_users_id_fk";
  
  ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "people_user_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_knowledge_entries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_review_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_analytics_daily_fk";
  
  ALTER TABLE "articles" ALTER COLUMN "topic" SET DATA TYPE text;
  DROP TYPE "public"."enum_articles_topic";
  CREATE TYPE "public"."enum_articles_topic" AS ENUM('autism', 'adhd', 'adolescenti', 'integrare-senzoriala', 'logopedie', 'qeeg', 'anxietate-depresie', 'editorial');
  ALTER TABLE "articles" ALTER COLUMN "topic" SET DATA TYPE "public"."enum_articles_topic" USING "topic"::"public"."enum_articles_topic";
  -- Hand-edited: back to upstream's "status"; a published article stays published.
  ALTER TABLE "articles" ADD COLUMN "status" text DEFAULT 'in-review';
  UPDATE "articles" SET "status" = CASE WHEN "_status"::text = 'published' THEN 'published' ELSE 'in-review' END;
  ALTER TABLE "articles" DROP COLUMN "_status";
  DROP TYPE "public"."enum_articles_status";
  CREATE TYPE "public"."enum_articles_status" AS ENUM('in-review', 'published');
  ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'in-review'::"public"."enum_articles_status";
  ALTER TABLE "articles" ALTER COLUMN "status" SET DATA TYPE "public"."enum_articles_status" USING "status"::"public"."enum_articles_status";
  ALTER TABLE "articles" ALTER COLUMN "status" SET NOT NULL;
  DROP INDEX IF EXISTS "articles_cover_idx";
  DROP INDEX IF EXISTS "articles_brand_idx";
  DROP INDEX IF EXISTS "articles_workflow_workflow_stage_idx";
  DROP INDEX IF EXISTS "articles_workflow_workflow_submitted_by_idx";
  DROP INDEX IF EXISTS "articles_author_user_idx";
  DROP INDEX IF EXISTS "articles__status_idx";
  DROP INDEX IF EXISTS "articles_review_review_reviewer_user_idx";
  DROP INDEX IF EXISTS "people_user_idx";
  DROP INDEX IF EXISTS "media_sizes_thumb_sizes_thumb_filename_idx";
  DROP INDEX IF EXISTS "media_sizes_card_sizes_card_filename_idx";
  DROP INDEX IF EXISTS "media_sizes_hero_sizes_hero_filename_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_knowledge_entries_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_review_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_analytics_daily_id_idx";
  ALTER TABLE "articles_blocks_p_locales" ALTER COLUMN "text" SET NOT NULL;
  ALTER TABLE "articles_blocks_h2_locales" ALTER COLUMN "text" SET NOT NULL;
  ALTER TABLE "articles_blocks_quote_locales" ALTER COLUMN "text" SET NOT NULL;
  ALTER TABLE "articles_blocks_list_items_locales" ALTER COLUMN "text" SET NOT NULL;
  ALTER TABLE "articles_sources" ALTER COLUMN "href" SET NOT NULL;
  ALTER TABLE "articles_sources_locales" ALTER COLUMN "label" SET NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "slug" SET NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "brand" SET NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "topic" SET NOT NULL;
  ALTER TABLE "articles" ALTER COLUMN "kind" DROP DEFAULT;
  ALTER TABLE "articles_locales" ALTER COLUMN "title" SET NOT NULL;
  ALTER TABLE "articles" DROP COLUMN "cover_id";
  ALTER TABLE "articles" DROP COLUMN "ai_drafted";
  ALTER TABLE "articles" DROP COLUMN "workflow_stage";
  ALTER TABLE "articles" DROP COLUMN "workflow_submitted_at";
  ALTER TABLE "articles" DROP COLUMN "workflow_submitted_by_id";
  ALTER TABLE "articles" DROP COLUMN "author_user_id";
  ALTER TABLE "articles_locales" DROP COLUMN "review_state";
  ALTER TABLE "articles_locales" DROP COLUMN "review_reviewer_user_id";
  ALTER TABLE "articles_locales" DROP COLUMN "review_reviewer_name";
  ALTER TABLE "articles_locales" DROP COLUMN "review_approved_at";
  ALTER TABLE "articles_locales" DROP COLUMN "review_approved_hash";
  ALTER TABLE "articles_locales" DROP COLUMN "review_notes";
  ALTER TABLE "people" DROP COLUMN "user_id";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_url";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_width";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_height";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_card_url";
  ALTER TABLE "media" DROP COLUMN "sizes_card_width";
  ALTER TABLE "media" DROP COLUMN "sizes_card_height";
  ALTER TABLE "media" DROP COLUMN "sizes_card_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_card_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_card_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_url";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_width";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_height";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_filename";
  ALTER TABLE "users" DROP COLUMN "enable_a_p_i_key";
  ALTER TABLE "users" DROP COLUMN "api_key";
  ALTER TABLE "users" DROP COLUMN "api_key_index";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "knowledge_entries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "review_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "analytics_daily_id";
  DROP TYPE "public"."enum_articles_workflow_stage";
  DROP TYPE "public"."enum_articles_review_state";
  DROP TYPE "public"."enum__articles_v_version_brand";
  DROP TYPE "public"."enum__articles_v_version_topic";
  DROP TYPE "public"."enum__articles_v_version_kind";
  DROP TYPE "public"."enum__articles_v_version_workflow_stage";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum__articles_v_published_locale";
  DROP TYPE "public"."enum__articles_v_version_review_state";
  DROP TYPE "public"."enum_knowledge_entries_brand";
  DROP TYPE "public"."enum_knowledge_entries_kind";
  DROP TYPE "public"."enum_knowledge_entries_workflow_stage";
  DROP TYPE "public"."enum_knowledge_entries_status";
  DROP TYPE "public"."enum_knowledge_entries_review_state";
  DROP TYPE "public"."enum__knowledge_entries_v_version_brand";
  DROP TYPE "public"."enum__knowledge_entries_v_version_kind";
  DROP TYPE "public"."enum__knowledge_entries_v_version_workflow_stage";
  DROP TYPE "public"."enum__knowledge_entries_v_version_status";
  DROP TYPE "public"."enum__knowledge_entries_v_published_locale";
  DROP TYPE "public"."enum__knowledge_entries_v_version_review_state";
  DROP TYPE "public"."enum_review_events_action";
  DROP TYPE "public"."enum_analytics_daily_metric";
  DROP TYPE "public"."enum_ai_settings_psizone_embeddings";
  DROP TYPE "public"."enum_ai_settings_psizone_embed_model";
  DROP TYPE "public"."enum_ai_settings_eqsync_embeddings";
  DROP TYPE "public"."enum_ai_settings_eqsync_embed_model";
  DROP TYPE "public"."enum_ai_settings_hemisync_embeddings";
  DROP TYPE "public"."enum_ai_settings_hemisync_embed_model";
  DROP TYPE "public"."enum_ai_settings_blog_embeddings";
  DROP TYPE "public"."enum_ai_settings_blog_embed_model";`);
}
