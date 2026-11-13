import type { Hono } from "hono";
import { hashSecret } from "../auth/service-keys";
import { createTokenVerifier } from "../auth/tokens";
import { createAccess } from "../authz/access";
import { createMemoryAuthz, type MemoryAuthz, platformAdminTuples } from "../authz/memory";
import { buildDeps } from "../build";
import type { Config } from "../config";
import { createApp } from "../http/app";
import type { Deps, HttpEnv, LogEvent } from "../http/context";
import { createMemoryMailer, type MemoryMailer } from "../ports/mail";
import { createMemoryNotify, type MemoryNotify } from "../ports/notify";
import { createMemoryObjects, type MemoryObjects } from "../ports/objects";
import { createLimiter } from "../ports/ratelimit";
import { createMemoryStore, type MemoryStore } from "../store/memory";
import { createTestIssuer, type MintOptions, type TestIssuer } from "./tokens";

/** Fixed: Friday 13 November 2026, 08:00 UTC (10:00 in Bucharest). */
export const NOW = Date.UTC(2026, 10, 13, 8, 0, 0);
export const HOUR = 3_600_000;
export const MASTER_KEY = "ab".repeat(32);
export const SECRETS = {
	"psizone-web": "psizone-web-secret-0001",
	"hemisync-web": "hemisync-web-secret-0002",
	cms: "cms-secret-0003",
} as const;

export interface Reply {
	status: number;
	json: Record<string, unknown>;
	headers: Headers;
}

export interface World {
	app: Hono<HttpEnv>;
	deps: Deps;
	store: MemoryStore;
	authz: MemoryAuthz;
	mail: MemoryMailer;
	objects: MemoryObjects;
	notifier: MemoryNotify;
	issuer: TestIssuer;
	logs: LogEvent[];
	clock: { now: number };
	/** One call as a signed-in person (or, with `null`, with no credential at all). */
	call(
		as: string | null,
		method: string,
		path: string,
		body?: unknown,
		options?: { mint?: MintOptions; headers?: Record<string, string> },
	): Promise<Reply>;
	/** One call with a service key. */
	callKey(
		caller: keyof typeof SECRETS,
		method: string,
		path: string,
		body?: unknown,
		headers?: Record<string, string>,
	): Promise<Reply>;
	/** Everything the service holds that a refusal must leave alone: rows, change feed, audit, tuples, outbox, signed links. */
	fingerprint(): string;
}

export function testConfig(issuer: TestIssuer): Config {
	return {
		env: "test",
		port: 0,
		publicUrl: "https://api-programari.test",
		issuers: [{ issuer: issuer.issuer, audiences: [issuer.audience] }],
		callers: [
			{ id: "psizone-web", app: "psizone" },
			{ id: "hemisync-web", app: "hemisync" },
			{ id: "cms", app: "psizone" },
		],
		masterKey: MASTER_KEY,
		store: { kind: "memory" },
		authz: { kind: "memory" },
		mail: undefined,
		objects: undefined,
		callerHashes: new Map(Object.entries(SECRETS).map(([id, secret]) => [id, hashSecret(secret)])),
	};
}

/** The service on every in-memory adapter, with no data: apps are created through the API like anywhere else. */
export async function createBareWorld(): Promise<World> {
	const clock = { now: NOW };
	const issuer = await createTestIssuer(undefined, undefined, () => clock.now);
	const store = createMemoryStore(() => clock.now);
	const authz = createMemoryAuthz(platformAdminTuples("root"));
	const mail = createMemoryMailer();
	const objects = createMemoryObjects(() => clock.now);
	const notifier = createMemoryNotify();
	const logs: LogEvent[] = [];
	const config = testConfig(issuer);
	const deps = buildDeps(config, {
		store,
		authz,
		access: createAccess(
			authz,
			async (app, subject) => new Set((await store.c.members.get(app, subject))?.denies ?? []),
		),
		verifier: createTokenVerifier({
			issuers: config.issuers,
			keys: issuer.keys,
			now: () => new Date(clock.now),
		}),
		mailer: mail,
		objects,
		notifier,
		limiter: createLimiter({ capacity: 1000, refillPerSecond: 1000 }, () => clock.now),
		clock: () => clock.now,
		log: (e) => logs.push(e),
		streamHeartbeatMs: 20,
	});
	const app = createApp(deps);

	async function send(
		method: string,
		path: string,
		body: unknown,
		headers: Record<string, string>,
	): Promise<Reply> {
		const res = await app.request(path, {
			method,
			headers: {
				...(body === undefined ? {} : { "content-type": "application/json" }),
				...headers,
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		const text = await res.text();
		return {
			status: res.status,
			json: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
			headers: res.headers,
		};
	}

	return {
		app,
		deps,
		store,
		authz,
		mail,
		objects,
		notifier,
		issuer,
		logs,
		clock,
		async call(as, method, path, body, options = {}) {
			const headers = {
				...(options.headers ?? {}),
				...(as === null ? {} : { authorization: `Bearer ${await issuer.mint(as, options.mint)}` }),
			};
			return send(method, path, body, headers);
		},
		callKey: (caller, method, path, body, headers = {}) =>
			send(method, path, body, { "x-service-key": `${caller}.${SECRETS[caller]}`, ...headers }),
		fingerprint: () =>
			JSON.stringify([
				store.dump(),
				authz
					.tuples()
					.map((t) => `${t.user}|${t.relation}|${t.object}`)
					.sort(),
				mail.outbox,
				objects.removed,
				notifier.sent,
			]),
	};
}
