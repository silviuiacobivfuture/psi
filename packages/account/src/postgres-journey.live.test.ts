import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readBlock } from "../dev/env-block";
import { LOCAL_BLOCK } from "../dev/local";
import { postgresStores } from "./stores/postgres";
import type { Stores } from "./stores/types";

/** The journey's Postgres stores against the local Postgres `local:up` runs. FAILS when it is not running. */
const url =
	readBlock(join(import.meta.dirname, "..", "..", "..", "apps/blog-web/.env"), LOCAL_BLOCK)
		.ACCOUNT_DATABASE_URL ?? "";
const run = Date.now();
let stores: Stores;

async function person(tag: string): Promise<string> {
	const subject = `live-journey-${tag}-${run}`;
	await stores.accounts.signedIn(
		{
			issuer: "https://i.test/",
			subject,
			email: `${tag}@psizone.test`,
			name: tag,
		},
		run,
	);
	return subject;
}

beforeAll(async () => {
	expect(url, "run `pnpm --filter @psi/account local:up` first").not.toBe("");
	stores = await postgresStores(url);
});
afterAll(async () => {
	await stores.close();
});

describe("journey stores on Postgres (live)", () => {
	it("keeps turns in order, returns only the last N, one conversation per account and site", async () => {
		const s = await person("turns");
		for (let i = 1; i <= 5; i++) {
			await stores.conversations.append(s, "psizone", {
				question: `q${i}`,
				answer: `a${i}`,
				at: run + i,
			});
		}
		await stores.conversations.append(s, "blog", {
			question: "b",
			answer: "b",
			at: run + 9,
		});
		const [latest, older] = await stores.conversations.list(s);
		expect(latest?.site).toBe("blog");
		expect(older?.turns).toBe(5);
		const psizone = await stores.conversations.forSite(s, "psizone");
		if (psizone === null) throw new Error("no conversation");
		expect((await stores.conversations.turns(psizone.id, 3)).map((t) => t.question)).toEqual([
			"q3",
			"q4",
			"q5",
		]);
		await stores.conversations.removeAll(s);
		expect(await stores.conversations.list(s)).toEqual([]);
	});

	it("withdrawing guide memory closes the grant and deletes every conversation, keeping the history", async () => {
		const s = await person("withdraw");
		const other = await person("bystander");
		await stores.consents.grant(s, "guide_memory", "v1", run);
		await stores.consents.grant(s, "guide_memory", "v1", run + 1);
		expect(await stores.consents.list(s)).toHaveLength(1);
		await stores.conversations.append(s, "psizone", {
			question: "q",
			answer: "a",
			at: run,
		});
		await stores.conversations.append(other, "psizone", {
			question: "q",
			answer: "a",
			at: run,
		});
		await stores.consents.withdraw(s, "guide_memory", run + 2);
		expect(await stores.consents.current(s, "guide_memory")).toBe(false);
		expect(await stores.conversations.list(s)).toEqual([]);
		expect(await stores.conversations.list(other)).toHaveLength(1);
		await stores.consents.grant(s, "guide_memory", "v2", run + 3);
		const history = await stores.consents.list(s);
		expect(history.map((c) => [c.wordingVersion, c.withdrawnAt === null])).toEqual([
			["v2", true],
			["v1", false],
		]);
		await stores.accounts.erase(other);
	});

	it("erasure cascades through profile, consents, conversations, sessions and saved articles", async () => {
		const s = await person("erase");
		await stores.profiles.save(
			s,
			{
				displayName: "E",
				phone: "+40 700 000 000",
				preferredContact: "phone",
				language: "en",
			},
			run,
		);
		expect(await stores.profiles.get(s)).toMatchObject({
			displayName: "E",
			language: "en",
		});
		await stores.consents.grant(s, "guide_memory", "v1", run);
		await stores.conversations.append(s, "psizone", {
			question: "q",
			answer: "a",
			at: run,
		});
		await stores.savedArticles.save(s, "despre-anxietate", run);
		await stores.sessions.create(`${s}-session`, {
			subject: s,
			issuer: "https://i.test/",
			sid: "x",
			idToken: "t",
			email: null,
			name: null,
			createdAt: run,
			lastSeenAt: run,
		});
		await stores.accounts.erase(s);
		expect(await stores.accounts.get(s)).toBeNull();
		expect(await stores.profiles.get(s)).toBeNull();
		expect(await stores.consents.list(s)).toEqual([]);
		expect(await stores.conversations.list(s)).toEqual([]);
		expect(await stores.savedArticles.list(s)).toEqual([]);
		expect(await stores.sessions.read(`${s}-session`)).toBeNull();
	});

	it("refuses a malformed conversation id without touching the database", async () => {
		expect(await stores.conversations.get("not-a-uuid")).toBeNull();
		expect(await stores.conversations.turns("not-a-uuid", 5)).toEqual([]);
	});
});
