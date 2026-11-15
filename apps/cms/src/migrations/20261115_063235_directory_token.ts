import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

/** The directory's refresh token per person (auth/directory-check.ts): hidden, never returned. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "directory_token" varchar;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "directory_token";`);
}
