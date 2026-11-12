import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readBlock } from "../dev/env-block";
import { LOCAL_BLOCK } from "../dev/local";
import { postgresStores } from "./stores/postgres";
import type { Stores } from "./stores/types";

/** Against the local Postgres `local:up` runs. FAILS when it is not running, never skips. */
const url =
	readBlock(join(import.meta.dirname, "..", "..", "..", "apps/blog-web/.env"), LOCAL_BLOCK)
		.ACCOUNT_DATABASE_URL ?? "";
const subject = `live-${Date.now()}`;
let stores: Stores;

beforeAll(async () => {
	expect(url, "run `pnpm --filter @psi/account local:up` first").not.toBe("");
	stores = await postgresStores(url);
});
afterAll(async () => {
	await stores.close();
});

describe("Postgres stores (live)", () => {
	it("keeps sessions server-side and ends them by sid and by subject", async () => {
		const now = Date.now();
		await stores.accounts.signedIn(
			{
				issuer: "https://i.test/",
				subject,
				email: "a@psizone.test",
				name: "A",
			},
			now,
		);
		const rec = {
			subject,
			issuer: "https://i.test/",
			sid: "s1",
			idToken: "t",
			email: null,
			name: null,
			createdAt: now,
			lastSeenAt: now,
		};
		await stores.sessions.create(`${subject}-1`, rec);
		await stores.sessions.create(`${subject}-2`, { ...rec, sid: "s2" });
		expect((await stores.sessions.read(`${subject}-1`))?.sid).toBe("s1");
		expect(await stores.sessions.removeBySid("https://i.test/", "s1")).toBe(1);
		expect(await stores.sessions.read(`${subject}-1`)).toBeNull();
		expect(await stores.sessions.removeBySubject(subject)).toBe(1);
	});

	it("saves an article once per person, and an account's erasure cascades through every row", async () => {
		const a = await stores.savedArticles.save(subject, "despre-anxietate", Date.now());
		const again = await stores.savedArticles.save(subject, "despre-anxietate", Date.now());
		expect(again.id).toBe(a.id);
		expect((await stores.savedArticles.list(subject)).map((s) => s.slug)).toEqual([
			"despre-anxietate",
		]);
		expect(await stores.savedArticles.get("not-a-uuid")).toBeNull();
		const sql = postgres(url, { max: 1, onnotice: () => {} });
		await sql`DELETE FROM account WHERE subject = ${subject}`;
		await sql.end();
		expect(await stores.savedArticles.get(a.id)).toBeNull();
		expect(await stores.accounts.get(subject)).toBeNull();
	});
});
