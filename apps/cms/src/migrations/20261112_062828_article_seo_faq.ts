import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'cuplu-familie';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'post-avc';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'psiho-oncologie';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'sport';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'psihoterapie';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'neuromodulare';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'parinti';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'creier-si-minte';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'sunet-si-creier';
  ALTER TYPE "public"."enum_articles_topic" ADD VALUE 'meditatie-si-relaxare';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'cuplu-familie';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'post-avc';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'psiho-oncologie';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'sport';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'psihoterapie';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'neuromodulare';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'parinti';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'creier-si-minte';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'sunet-si-creier';
  ALTER TYPE "public"."enum__articles_v_version_topic" ADD VALUE 'meditatie-si-relaxare';
  CREATE TABLE "articles_seo_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"keyword" varchar
  );
  
  CREATE TABLE "articles_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "articles_faq_locales" (
  	"q" varchar,
  	"a" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "articles_related" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"slug" varchar
  );
  
  CREATE TABLE "_articles_v_version_seo_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"keyword" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_faq_locales" (
  	"q" varchar,
  	"a" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_version_related" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "articles_locales" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "articles_locales" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "_articles_v_locales" ADD COLUMN "version_seo_title" varchar;
  ALTER TABLE "_articles_v_locales" ADD COLUMN "version_seo_description" varchar;
  ALTER TABLE "articles_seo_keywords" ADD CONSTRAINT "articles_seo_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_faq" ADD CONSTRAINT "articles_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_faq_locales" ADD CONSTRAINT "articles_faq_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_related" ADD CONSTRAINT "articles_related_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_seo_keywords" ADD CONSTRAINT "_articles_v_version_seo_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_faq" ADD CONSTRAINT "_articles_v_version_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_faq_locales" ADD CONSTRAINT "_articles_v_version_faq_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_version_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_related" ADD CONSTRAINT "_articles_v_version_related_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_seo_keywords_order_idx" ON "articles_seo_keywords" USING btree ("_order");
  CREATE INDEX "articles_seo_keywords_parent_id_idx" ON "articles_seo_keywords" USING btree ("_parent_id");
  CREATE INDEX "articles_seo_keywords_locale_idx" ON "articles_seo_keywords" USING btree ("_locale");
  CREATE INDEX "articles_faq_order_idx" ON "articles_faq" USING btree ("_order");
  CREATE INDEX "articles_faq_parent_id_idx" ON "articles_faq" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "articles_faq_locales_locale_parent_id_unique" ON "articles_faq_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_faq_locales_parent_id_idx" ON "articles_faq_locales" USING btree ("_parent_id");
  CREATE INDEX "articles_related_order_idx" ON "articles_related" USING btree ("_order");
  CREATE INDEX "articles_related_parent_id_idx" ON "articles_related" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_seo_keywords_order_idx" ON "_articles_v_version_seo_keywords" USING btree ("_order");
  CREATE INDEX "_articles_v_version_seo_keywords_parent_id_idx" ON "_articles_v_version_seo_keywords" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_seo_keywords_locale_idx" ON "_articles_v_version_seo_keywords" USING btree ("_locale");
  CREATE INDEX "_articles_v_version_faq_order_idx" ON "_articles_v_version_faq" USING btree ("_order");
  CREATE INDEX "_articles_v_version_faq_parent_id_idx" ON "_articles_v_version_faq" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_articles_v_version_faq_locales_locale_parent_id_unique" ON "_articles_v_version_faq_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_version_faq_locales_parent_id_idx" ON "_articles_v_version_faq_locales" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_related_order_idx" ON "_articles_v_version_related" USING btree ("_order");
  CREATE INDEX "_articles_v_version_related_parent_id_idx" ON "_articles_v_version_related" USING btree ("_parent_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DROP TABLE "articles_seo_keywords" CASCADE;
  DROP TABLE "articles_faq" CASCADE;
  DROP TABLE "articles_faq_locales" CASCADE;
  DROP TABLE "articles_related" CASCADE;
  DROP TABLE "_articles_v_version_seo_keywords" CASCADE;
  DROP TABLE "_articles_v_version_faq" CASCADE;
  DROP TABLE "_articles_v_version_faq_locales" CASCADE;
  DROP TABLE "_articles_v_version_related" CASCADE;
  ALTER TABLE "articles" ALTER COLUMN "topic" SET DATA TYPE text;
  DROP TYPE "public"."enum_articles_topic";
  CREATE TYPE "public"."enum_articles_topic" AS ENUM('autism', 'adhd', 'adolescenti', 'integrare-senzoriala', 'logopedie', 'qeeg', 'anxietate-depresie', 'editorial', 'cum-lucram', 'programul-eqsync', 'explorarea-constiintei');
  ALTER TABLE "articles" ALTER COLUMN "topic" SET DATA TYPE "public"."enum_articles_topic" USING "topic"::"public"."enum_articles_topic";
  ALTER TABLE "_articles_v" ALTER COLUMN "version_topic" SET DATA TYPE text;
  DROP TYPE "public"."enum__articles_v_version_topic";
  CREATE TYPE "public"."enum__articles_v_version_topic" AS ENUM('autism', 'adhd', 'adolescenti', 'integrare-senzoriala', 'logopedie', 'qeeg', 'anxietate-depresie', 'editorial', 'cum-lucram', 'programul-eqsync', 'explorarea-constiintei');
  ALTER TABLE "_articles_v" ALTER COLUMN "version_topic" SET DATA TYPE "public"."enum__articles_v_version_topic" USING "version_topic"::"public"."enum__articles_v_version_topic";
  ALTER TABLE "articles_locales" DROP COLUMN "seo_title";
  ALTER TABLE "articles_locales" DROP COLUMN "seo_description";
  ALTER TABLE "_articles_v_locales" DROP COLUMN "version_seo_title";
  ALTER TABLE "_articles_v_locales" DROP COLUMN "version_seo_description";`);
}
