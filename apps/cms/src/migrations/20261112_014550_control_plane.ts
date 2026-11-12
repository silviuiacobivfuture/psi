import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_site_settings_psizone_social_network" AS ENUM('facebook', 'instagram', 'youtube', 'linkedin', 'tiktok');
  CREATE TYPE "public"."enum_site_settings_eqsync_social_network" AS ENUM('facebook', 'instagram', 'youtube', 'linkedin', 'tiktok');
  CREATE TYPE "public"."enum_site_settings_hemisync_social_network" AS ENUM('facebook', 'instagram', 'youtube', 'linkedin', 'tiktok');
  CREATE TYPE "public"."enum_site_settings_blog_social_network" AS ENUM('facebook', 'instagram', 'youtube', 'linkedin', 'tiktok');
  CREATE TYPE "public"."enum_site_settings_psizone_booking_in_chat" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_psizone_accounts_sign_in" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_psizone_install_prompt" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_eqsync_booking_in_chat" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_eqsync_accounts_sign_in" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_eqsync_install_prompt" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_hemisync_booking_in_chat" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_hemisync_accounts_sign_in" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_hemisync_install_prompt" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_blog_booking_in_chat" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_blog_accounts_sign_in" AS ENUM('inherit', 'on', 'off');
  CREATE TYPE "public"."enum_site_settings_blog_install_prompt" AS ENUM('inherit', 'on', 'off');
  ALTER TYPE "public"."enum_review_events_action" ADD VALUE 'ingest';
  ALTER TYPE "public"."enum_review_events_action" ADD VALUE 'decide';
  ALTER TYPE "public"."enum_review_events_action" ADD VALUE 'schedule';
  ALTER TYPE "public"."enum_review_events_action" ADD VALUE 'account_view';
  ALTER TYPE "public"."enum_review_events_action" ADD VALUE 'account_export';
  ALTER TYPE "public"."enum_review_events_action" ADD VALUE 'account_erase';
  ALTER TYPE "public"."enum_review_events_action" ADD VALUE 'push_test';
  CREATE TABLE "site_settings_psizone_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tel" varchar NOT NULL,
  	"display" varchar,
  	"label_ro" varchar,
  	"label_en" varchar
  );
  
  CREATE TABLE "site_settings_psizone_addresses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label_ro" varchar,
  	"label_en" varchar,
  	"street" varchar NOT NULL,
  	"city" varchar NOT NULL,
  	"country" varchar DEFAULT 'RO',
  	"map_url" varchar
  );
  
  CREATE TABLE "site_settings_psizone_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"days_ro" varchar NOT NULL,
  	"days_en" varchar NOT NULL,
  	"hours" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings_psizone_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"network" "enum_site_settings_psizone_social_network" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings_eqsync_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tel" varchar NOT NULL,
  	"display" varchar,
  	"label_ro" varchar,
  	"label_en" varchar
  );
  
  CREATE TABLE "site_settings_eqsync_addresses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label_ro" varchar,
  	"label_en" varchar,
  	"street" varchar NOT NULL,
  	"city" varchar NOT NULL,
  	"country" varchar DEFAULT 'RO',
  	"map_url" varchar
  );
  
  CREATE TABLE "site_settings_eqsync_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"days_ro" varchar NOT NULL,
  	"days_en" varchar NOT NULL,
  	"hours" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings_eqsync_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"network" "enum_site_settings_eqsync_social_network" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings_hemisync_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tel" varchar NOT NULL,
  	"display" varchar,
  	"label_ro" varchar,
  	"label_en" varchar
  );
  
  CREATE TABLE "site_settings_hemisync_addresses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label_ro" varchar,
  	"label_en" varchar,
  	"street" varchar NOT NULL,
  	"city" varchar NOT NULL,
  	"country" varchar DEFAULT 'RO',
  	"map_url" varchar
  );
  
  CREATE TABLE "site_settings_hemisync_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"days_ro" varchar NOT NULL,
  	"days_en" varchar NOT NULL,
  	"hours" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings_hemisync_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"network" "enum_site_settings_hemisync_social_network" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings_blog_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tel" varchar NOT NULL,
  	"display" varchar,
  	"label_ro" varchar,
  	"label_en" varchar
  );
  
  CREATE TABLE "site_settings_blog_addresses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label_ro" varchar,
  	"label_en" varchar,
  	"street" varchar NOT NULL,
  	"city" varchar NOT NULL,
  	"country" varchar DEFAULT 'RO',
  	"map_url" varchar
  );
  
  CREATE TABLE "site_settings_blog_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"days_ro" varchar NOT NULL,
  	"days_en" varchar NOT NULL,
  	"hours" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings_blog_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"network" "enum_site_settings_blog_social_network" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"psizone_hero_years" numeric,
  	"psizone_booking_in_chat" "enum_site_settings_psizone_booking_in_chat" DEFAULT 'inherit' NOT NULL,
  	"psizone_accounts_sign_in" "enum_site_settings_psizone_accounts_sign_in" DEFAULT 'inherit' NOT NULL,
  	"psizone_install_prompt" "enum_site_settings_psizone_install_prompt" DEFAULT 'inherit' NOT NULL,
  	"eqsync_hero_years" numeric,
  	"eqsync_booking_in_chat" "enum_site_settings_eqsync_booking_in_chat" DEFAULT 'inherit' NOT NULL,
  	"eqsync_accounts_sign_in" "enum_site_settings_eqsync_accounts_sign_in" DEFAULT 'inherit' NOT NULL,
  	"eqsync_install_prompt" "enum_site_settings_eqsync_install_prompt" DEFAULT 'inherit' NOT NULL,
  	"hemisync_hero_years" numeric,
  	"hemisync_booking_in_chat" "enum_site_settings_hemisync_booking_in_chat" DEFAULT 'inherit' NOT NULL,
  	"hemisync_accounts_sign_in" "enum_site_settings_hemisync_accounts_sign_in" DEFAULT 'inherit' NOT NULL,
  	"hemisync_install_prompt" "enum_site_settings_hemisync_install_prompt" DEFAULT 'inherit' NOT NULL,
  	"blog_hero_years" numeric,
  	"blog_booking_in_chat" "enum_site_settings_blog_booking_in_chat" DEFAULT 'inherit' NOT NULL,
  	"blog_accounts_sign_in" "enum_site_settings_blog_accounts_sign_in" DEFAULT 'inherit' NOT NULL,
  	"blog_install_prompt" "enum_site_settings_blog_install_prompt" DEFAULT 'inherit' NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "site_settings_psizone_phones" ADD CONSTRAINT "site_settings_psizone_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_psizone_addresses" ADD CONSTRAINT "site_settings_psizone_addresses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_psizone_opening_hours" ADD CONSTRAINT "site_settings_psizone_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_psizone_social" ADD CONSTRAINT "site_settings_psizone_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_eqsync_phones" ADD CONSTRAINT "site_settings_eqsync_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_eqsync_addresses" ADD CONSTRAINT "site_settings_eqsync_addresses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_eqsync_opening_hours" ADD CONSTRAINT "site_settings_eqsync_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_eqsync_social" ADD CONSTRAINT "site_settings_eqsync_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_hemisync_phones" ADD CONSTRAINT "site_settings_hemisync_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_hemisync_addresses" ADD CONSTRAINT "site_settings_hemisync_addresses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_hemisync_opening_hours" ADD CONSTRAINT "site_settings_hemisync_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_hemisync_social" ADD CONSTRAINT "site_settings_hemisync_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_blog_phones" ADD CONSTRAINT "site_settings_blog_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_blog_addresses" ADD CONSTRAINT "site_settings_blog_addresses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_blog_opening_hours" ADD CONSTRAINT "site_settings_blog_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_blog_social" ADD CONSTRAINT "site_settings_blog_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_settings_psizone_phones_order_idx" ON "site_settings_psizone_phones" USING btree ("_order");
  CREATE INDEX "site_settings_psizone_phones_parent_id_idx" ON "site_settings_psizone_phones" USING btree ("_parent_id");
  CREATE INDEX "site_settings_psizone_addresses_order_idx" ON "site_settings_psizone_addresses" USING btree ("_order");
  CREATE INDEX "site_settings_psizone_addresses_parent_id_idx" ON "site_settings_psizone_addresses" USING btree ("_parent_id");
  CREATE INDEX "site_settings_psizone_opening_hours_order_idx" ON "site_settings_psizone_opening_hours" USING btree ("_order");
  CREATE INDEX "site_settings_psizone_opening_hours_parent_id_idx" ON "site_settings_psizone_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "site_settings_psizone_social_order_idx" ON "site_settings_psizone_social" USING btree ("_order");
  CREATE INDEX "site_settings_psizone_social_parent_id_idx" ON "site_settings_psizone_social" USING btree ("_parent_id");
  CREATE INDEX "site_settings_eqsync_phones_order_idx" ON "site_settings_eqsync_phones" USING btree ("_order");
  CREATE INDEX "site_settings_eqsync_phones_parent_id_idx" ON "site_settings_eqsync_phones" USING btree ("_parent_id");
  CREATE INDEX "site_settings_eqsync_addresses_order_idx" ON "site_settings_eqsync_addresses" USING btree ("_order");
  CREATE INDEX "site_settings_eqsync_addresses_parent_id_idx" ON "site_settings_eqsync_addresses" USING btree ("_parent_id");
  CREATE INDEX "site_settings_eqsync_opening_hours_order_idx" ON "site_settings_eqsync_opening_hours" USING btree ("_order");
  CREATE INDEX "site_settings_eqsync_opening_hours_parent_id_idx" ON "site_settings_eqsync_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "site_settings_eqsync_social_order_idx" ON "site_settings_eqsync_social" USING btree ("_order");
  CREATE INDEX "site_settings_eqsync_social_parent_id_idx" ON "site_settings_eqsync_social" USING btree ("_parent_id");
  CREATE INDEX "site_settings_hemisync_phones_order_idx" ON "site_settings_hemisync_phones" USING btree ("_order");
  CREATE INDEX "site_settings_hemisync_phones_parent_id_idx" ON "site_settings_hemisync_phones" USING btree ("_parent_id");
  CREATE INDEX "site_settings_hemisync_addresses_order_idx" ON "site_settings_hemisync_addresses" USING btree ("_order");
  CREATE INDEX "site_settings_hemisync_addresses_parent_id_idx" ON "site_settings_hemisync_addresses" USING btree ("_parent_id");
  CREATE INDEX "site_settings_hemisync_opening_hours_order_idx" ON "site_settings_hemisync_opening_hours" USING btree ("_order");
  CREATE INDEX "site_settings_hemisync_opening_hours_parent_id_idx" ON "site_settings_hemisync_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "site_settings_hemisync_social_order_idx" ON "site_settings_hemisync_social" USING btree ("_order");
  CREATE INDEX "site_settings_hemisync_social_parent_id_idx" ON "site_settings_hemisync_social" USING btree ("_parent_id");
  CREATE INDEX "site_settings_blog_phones_order_idx" ON "site_settings_blog_phones" USING btree ("_order");
  CREATE INDEX "site_settings_blog_phones_parent_id_idx" ON "site_settings_blog_phones" USING btree ("_parent_id");
  CREATE INDEX "site_settings_blog_addresses_order_idx" ON "site_settings_blog_addresses" USING btree ("_order");
  CREATE INDEX "site_settings_blog_addresses_parent_id_idx" ON "site_settings_blog_addresses" USING btree ("_parent_id");
  CREATE INDEX "site_settings_blog_opening_hours_order_idx" ON "site_settings_blog_opening_hours" USING btree ("_order");
  CREATE INDEX "site_settings_blog_opening_hours_parent_id_idx" ON "site_settings_blog_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "site_settings_blog_social_order_idx" ON "site_settings_blog_social" USING btree ("_order");
  CREATE INDEX "site_settings_blog_social_parent_id_idx" ON "site_settings_blog_social" USING btree ("_parent_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DROP TABLE "site_settings_psizone_phones" CASCADE;
  DROP TABLE "site_settings_psizone_addresses" CASCADE;
  DROP TABLE "site_settings_psizone_opening_hours" CASCADE;
  DROP TABLE "site_settings_psizone_social" CASCADE;
  DROP TABLE "site_settings_eqsync_phones" CASCADE;
  DROP TABLE "site_settings_eqsync_addresses" CASCADE;
  DROP TABLE "site_settings_eqsync_opening_hours" CASCADE;
  DROP TABLE "site_settings_eqsync_social" CASCADE;
  DROP TABLE "site_settings_hemisync_phones" CASCADE;
  DROP TABLE "site_settings_hemisync_addresses" CASCADE;
  DROP TABLE "site_settings_hemisync_opening_hours" CASCADE;
  DROP TABLE "site_settings_hemisync_social" CASCADE;
  DROP TABLE "site_settings_blog_phones" CASCADE;
  DROP TABLE "site_settings_blog_addresses" CASCADE;
  DROP TABLE "site_settings_blog_opening_hours" CASCADE;
  DROP TABLE "site_settings_blog_social" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  ALTER TABLE "review_events" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_review_events_action";
  CREATE TYPE "public"."enum_review_events_action" AS ENUM('submit', 'approve', 'reject', 'publish', 'unpublish', 'invalidate', 'delete');
  ALTER TABLE "review_events" ALTER COLUMN "action" SET DATA TYPE "public"."enum_review_events_action" USING "action"::"public"."enum_review_events_action";
  DROP TYPE "public"."enum_site_settings_psizone_social_network";
  DROP TYPE "public"."enum_site_settings_eqsync_social_network";
  DROP TYPE "public"."enum_site_settings_hemisync_social_network";
  DROP TYPE "public"."enum_site_settings_blog_social_network";
  DROP TYPE "public"."enum_site_settings_psizone_booking_in_chat";
  DROP TYPE "public"."enum_site_settings_psizone_accounts_sign_in";
  DROP TYPE "public"."enum_site_settings_psizone_install_prompt";
  DROP TYPE "public"."enum_site_settings_eqsync_booking_in_chat";
  DROP TYPE "public"."enum_site_settings_eqsync_accounts_sign_in";
  DROP TYPE "public"."enum_site_settings_eqsync_install_prompt";
  DROP TYPE "public"."enum_site_settings_hemisync_booking_in_chat";
  DROP TYPE "public"."enum_site_settings_hemisync_accounts_sign_in";
  DROP TYPE "public"."enum_site_settings_hemisync_install_prompt";
  DROP TYPE "public"."enum_site_settings_blog_booking_in_chat";
  DROP TYPE "public"."enum_site_settings_blog_accounts_sign_in";
  DROP TYPE "public"."enum_site_settings_blog_install_prompt";`);
}
