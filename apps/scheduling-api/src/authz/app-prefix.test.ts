import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { createLiveAuthz } from "./live";

interface Call {
	path: string;
	body: Record<string, unknown>;
}

function recorder(answer: unknown): { calls: Call[]; fetch: typeof globalThis.fetch } {
	const calls: Call[] = [];
	return {
		calls,
		fetch: (input, init) => {
			calls.push({
				path: new URL(String(input)).pathname,
				body: JSON.parse(String(init?.body)) as Record<string, unknown>,
			});
			return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
		},
	};
}

const build = (appPrefix: string | undefined, fetch: typeof globalThis.fetch) =>
	createLiveAuthz({
		readUrl: "http://fga:8081",
		writeUrl: "http://fga-admin:8080",
		storeId: "S",
		modelId: "M1",
		token: "tok",
		appPrefix,
		fetch,
	});

describe("OPENFGA_APP_PREFIX: one store, two instances", () => {
	it("a Check on the app object goes out with the prefix, other objects untouched", async () => {
		const r = recorder({ allowed: true });
		const authz = build("prod-", r.fetch);
		await authz.check("user:a", "member", "sched_app:psizone");
		await authz.check("user:a", "owner", "sched_calendar:c1");
		expect(r.calls.map((c) => c.body.tuple_key)).toEqual([
			{ user: "user:a", relation: "member", object: "sched_app:prod-psizone" },
			{ user: "user:a", relation: "owner", object: "sched_calendar:c1" },
		]);
	});

	it("tuples written and deleted carry it, in the object AND in an app userset", async () => {
		const r = recorder({});
		await build("prod-", r.fetch).write({
			writes: [
				{ user: "sched_role:r1#member", relation: "clients_view_all", object: "sched_app:psizone" },
				{ user: "sched_app:psizone", relation: "app", object: "sched_client:k1" },
			],
			deletes: [{ user: "user:a", relation: "member", object: "sched_app:psizone" }],
		});
		expect(r.calls[0]?.body).toMatchObject({
			writes: {
				tuple_keys: [
					{
						user: "sched_role:r1#member",
						relation: "clients_view_all",
						object: "sched_app:prod-psizone",
					},
					{ user: "sched_app:prod-psizone", relation: "app", object: "sched_client:k1" },
				],
			},
			deletes: {
				tuple_keys: [{ user: "user:a", relation: "member", object: "sched_app:prod-psizone" }],
			},
		});
	});

	it("a batch carries it", async () => {
		const r = recorder({ result: { "0": { allowed: true } } });
		await build("prod-", r.fetch).checkMany([
			{ user: "user:a", relation: "member", object: "sched_app:psizone" },
		]);
		expect(r.calls[0]?.body.checks).toMatchObject([
			{ tuple_key: { object: "sched_app:prod-psizone" } },
		]);
	});

	it("listing apps returns only this instance's, without the prefix", async () => {
		const r = recorder({
			objects: ["sched_app:prod-psizone", "sched_app:psizone", "sched_app:dev-psizone"],
		});
		expect(await build("prod-", r.fetch).listObjects("user:a", "member", "sched_app")).toEqual([
			"sched_app:psizone",
		]);
	});

	it("listing other types is not rewritten", async () => {
		const r = recorder({ objects: ["sched_client:k1"] });
		expect(await build("prod-", r.fetch).listObjects("user:a", "view", "sched_client")).toEqual([
			"sched_client:k1",
		]);
	});

	it("no prefix: every id goes out as it is", async () => {
		const r = recorder({ allowed: true });
		await build(undefined, r.fetch).check("user:a", "member", "sched_app:psizone");
		expect(r.calls[0]?.body.tuple_key).toMatchObject({ object: "sched_app:psizone" });
	});

	it("dev and prod over one store never see each other's app", async () => {
		const store = new Set<string>();
		const fetch: typeof globalThis.fetch = (_input, init) => {
			const body = JSON.parse(String(init?.body)) as {
				tuple_key?: { object: string };
				writes?: { tuple_keys: { object: string }[] };
			};
			for (const t of body.writes?.tuple_keys ?? []) store.add(t.object);
			const allowed = body.tuple_key !== undefined && store.has(body.tuple_key.object);
			return Promise.resolve(
				new Response(JSON.stringify(allowed ? { allowed } : {}), { status: 200 }),
			);
		};
		const prod = build("prod-", fetch);
		const dev = build("dev-", fetch);
		await prod.write({
			writes: [{ user: "user:a", relation: "member", object: "sched_app:psizone" }],
			deletes: [],
		});
		expect(await prod.check("user:a", "member", "sched_app:psizone")).toBe(true);
		expect(await dev.check("user:a", "member", "sched_app:psizone")).toBe(false);
	});
});

describe("OPENFGA_APP_PREFIX in the configuration", () => {
	const env = {
		NODE_ENV: "test",
		OIDC_ISSUERS: JSON.stringify([
			{ issuer: "https://auth.example/application/o/x/", audiences: ["a"] },
		]),
		CLINIC_MASTER_KEY: "0".repeat(64),
		SCHEDULING_STORE: "memory",
		AUTHZ: "openfga",
		OPENFGA_ENDPOINT: "http://fga:8081",
		OPENFGA_WRITE_ENDPOINT: "http://fga:8080",
		OPENFGA_STORE_ID: "S",
		OPENFGA_MODEL_ID: "M1",
		OPENFGA_TOKEN: "t",
	};

	it("is read, and empty when unset", () => {
		expect(loadConfig({ ...env, OPENFGA_APP_PREFIX: "prod-" }).authz).toMatchObject({
			appPrefix: "prod-",
		});
		expect(loadConfig(env).authz).toMatchObject({ appPrefix: "" });
	});

	it("refuses a prefix that is not lowercase letters, digits and dashes", () => {
		expect(() => loadConfig({ ...env, OPENFGA_APP_PREFIX: "Prod:" })).toThrow("OPENFGA_APP_PREFIX");
	});
});
