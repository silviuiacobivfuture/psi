import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { readBlock } from "../dev/env-block";
import { FGA_URL, LOCAL_BLOCK } from "../dev/local";
import { createAccount } from "./account";
import { type AuthzClient, createAuthzClient, StaticTokenSource } from "./authz/client";
import { recordTuples } from "./authz/tuples";
import { PLATFORM } from "./guard";
import { hashSessionId } from "./seal";
import { memoryStores } from "./stores/memory";

/**
 * Against the REAL engine: the local OpenFGA `pnpm --filter @psi/account local:up` runs, with psi's model
 * (estate/authz/fga.mod) written into a fresh store per run. This test FAILS — it never skips — when OpenFGA is not
 * running: a decision test that passes without the engine proves nothing.
 *
 * The one persisted tuple (a staff role) is written straight to the local admin API, standing in for Polaris.
 */
const ROOT = join(import.meta.dirname, "..", "..", "..");
const key = readBlock(join(ROOT, "apps/blog-web/.env"), LOCAL_BLOCK).OPENFGA_TOKEN ?? "";
const headers = {
	authorization: `Bearer ${key}`,
	"content-type": "application/json",
};
const ARTICLE = "blog_saved_article:3f0c9b2e-1111-4a5b-8c7d-000000000001";
const OWNER = "mock-ana-7f3c";
const STRANGER = "mock-bogdan-91a2";
const STAFF = "staff-dpo-01";

let storeId = "";
let modelId = "";
let authz: AuthzClient;

const owned = (owner: string | null) =>
	recordTuples({
		object: ARTICLE,
		platform: PLATFORM,
		owner,
		ownerRelations: ["viewer", "editor"],
	});

beforeAll(async () => {
	expect(key, "run `pnpm --filter @psi/account local:up` first").not.toBe("");
	const health = await fetch(`${FGA_URL}/healthz`).catch(() => null);
	expect(health?.ok, `local OpenFGA is not answering at ${FGA_URL}`).toBe(true);
	const store = z.object({ id: z.string() }).parse(
		await (
			await fetch(`${FGA_URL}/stores`, {
				method: "POST",
				headers,
				body: JSON.stringify({ name: "account-live-test" }),
			})
		).json(),
	);
	storeId = store.id;
	const out = execFileSync(
		"fga",
		[
			"model",
			"write",
			"--api-url",
			FGA_URL,
			"--api-token",
			key,
			"--store-id",
			storeId,
			"--file",
			join(ROOT, "estate/authz/fga.mod"),
		],
		{ encoding: "utf8" },
	);
	modelId = z
		.object({ authorization_model_id: z.string() })
		.parse(JSON.parse(out)).authorization_model_id;
	const write = await fetch(`${FGA_URL}/stores/${storeId}/write`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			authorization_model_id: modelId,
			writes: {
				tuple_keys: [
					{
						user: `user:${STAFF}`,
						relation: "role_blog_privacy_officer",
						object: PLATFORM,
					},
				],
			},
		}),
	});
	expect(write.ok).toBe(true);
	authz = createAuthzClient({
		endpoint: FGA_URL,
		storeId,
		modelId,
		token: new StaticTokenSource(key),
	});
});

describe("OpenFGA decisions with psi's model (live)", () => {
	it("allows the row's owner and denies a stranger", async () => {
		expect(
			await authz.check(
				{ user: `user:${OWNER}`, relation: "viewer", object: ARTICLE },
				{ tuples: owned(OWNER) },
			),
		).toBe(true);
		expect(
			await authz.check(
				{ user: `user:${OWNER}`, relation: "editor", object: ARTICLE },
				{ tuples: owned(OWNER) },
			),
		).toBe(true);
		expect(
			await authz.check(
				{ user: `user:${STRANGER}`, relation: "viewer", object: ARTICLE },
				{ tuples: owned(OWNER) },
			),
		).toBe(false);
		expect(
			await authz.check(
				{ user: `user:${STRANGER}`, relation: "editor", object: ARTICLE },
				{ tuples: owned(OWNER) },
			),
		).toBe(false);
	});

	it("persists nothing about the owner: without the row's facts the owner holds nothing", async () => {
		expect(
			await authz.check(
				{ user: `user:${OWNER}`, relation: "viewer", object: ARTICLE },
				{ tuples: owned(null) },
			),
		).toBe(false);
	});

	it("lets a catalog role (granted in Polaris) read but not change, and only through the platform", async () => {
		expect(
			await authz.check(
				{ user: `user:${STAFF}`, relation: "viewer", object: ARTICLE },
				{ tuples: owned(OWNER) },
			),
		).toBe(true);
		expect(
			await authz.check(
				{ user: `user:${STAFF}`, relation: "editor", object: ARTICLE },
				{ tuples: owned(OWNER) },
			),
		).toBe(false);
		// The record not attached to the platform: the role reaches nothing.
		expect(
			await authz.check({
				user: `user:${STAFF}`,
				relation: "viewer",
				object: ARTICLE,
			}),
		).toBe(false);
	});

	it("answers a batch per entry, each with its own record's facts", async () => {
		const other = "blog_saved_article:3f0c9b2e-1111-4a5b-8c7d-000000000002";
		const facts = new Map([
			[ARTICLE, owned(OWNER)],
			[
				other,
				recordTuples({
					object: other,
					platform: PLATFORM,
					owner: STRANGER,
					ownerRelations: ["viewer"],
				}),
			],
		]);
		const answers = await authz.batchCheck(
			[ARTICLE, other].map((object) => ({
				user: `user:${OWNER}`,
				relation: "viewer",
				object,
			})),
			{ tuplesFor: (req) => facts.get(req.object) ?? [] },
		);
		expect(answers.get(`user:${OWNER}#viewer@${ARTICLE}`)).toBe(true);
		expect(answers.get(`user:${OWNER}#viewer@${other}`)).toBe(false);
	});

	it("refuses a caller-supplied `now`, and a stale model pin is model_stale", async () => {
		await expect(
			authz.check({
				user: `user:${OWNER}`,
				relation: "viewer",
				object: ARTICLE,
				context: { now: "2020-01-01T00:00:00Z" },
			}),
		).rejects.toMatchObject({ code: "invalid" });
		const stale = createAuthzClient({
			endpoint: FGA_URL,
			storeId,
			modelId: "01JZZZZZZZZZZZZZZZZZZZZZZZ",
			token: new StaticTokenSource(key),
			retries: 0,
		});
		await expect(
			stale.check({
				user: `user:${OWNER}`,
				relation: "viewer",
				object: ARTICLE,
			}),
		).rejects.toMatchObject({ code: "model_stale" });
	});

	it("fails closed through the account guard: allowed, denied, and unavailable when OpenFGA is away", async () => {
		const stores = memoryStores();
		const now = Date.now();
		const sessionFor = async (subject: string, id: string) => {
			await stores.accounts.signedIn(
				{ issuer: "http://issuer.test/", subject, email: null, name: null },
				now,
			);
			await stores.sessions.create(hashSessionId(id), {
				subject,
				issuer: "http://issuer.test/",
				sid: null,
				idToken: "t",
				email: null,
				name: null,
				createdAt: now,
				lastSeenAt: now,
			});
		};
		await sessionFor(OWNER, "a".repeat(43));
		await sessionFor(STRANGER, "b".repeat(43));
		const site = { slug: "blog-web", key: "blog", origin: "http://blog.test" };
		const make = (endpoint: string) =>
			createAccount({
				site,
				stores,
				onWarn: () => {},
				env: {
					OPENFGA_ENDPOINT: endpoint,
					OPENFGA_STORE_ID: storeId,
					OPENFGA_MODEL_ID: modelId,
					OPENFGA_TOKEN: key,
				},
			});
		const route = (account: ReturnType<typeof make>) => {
			const app = new Hono();
			app.get(
				"/rec",
				account.can("editor", async () => ({
					object: ARTICLE,
					owner: OWNER,
					ownerRelations: ["viewer", "editor"],
				})),
				(c) => c.text("ok"),
			);
			return (id: string) =>
				app.fetch(
					new Request("http://blog.test/rec", {
						headers: { cookie: `__Host-psi-blog-session=${id}` },
					}),
				);
		};
		const live = route(make(FGA_URL));
		expect((await live("a".repeat(43))).status).toBe(200);
		expect((await live("b".repeat(43))).status).toBe(404);
		const away = route(make("http://127.0.0.1:9"));
		expect((await away("a".repeat(43))).status).toBe(503);
	});
});
