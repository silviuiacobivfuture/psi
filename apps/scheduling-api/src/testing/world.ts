import { createMemoryUsedLinks } from "@psi/notify/reminders";
import type { Hono } from "hono";
import { hashSecret } from "../auth/service-keys";
import { createTokenVerifier } from "../auth/tokens";
import { createAccess } from "../authz/access";
import { createMemoryAuthz, type MemoryAuthz, platformAdminTuples } from "../authz/memory";
import { buildDeps } from "../build";
import type { Config } from "../config";
import { createApp } from "../http/app";
import type { Deps, HttpEnv, LogEvent } from "../http/context";
import { createInviteActions, mountInviteRoutes } from "../invite-routes";
import { createMemoryMailer, type MemoryMailer } from "../ports/mail";
import { createMemoryNotify, type MemoryNotify } from "../ports/notify";
import { createMemoryObjects, type MemoryObjects } from "../ports/objects";
import { createLimiter } from "../ports/ratelimit";
import { createFakeSso, type FakeSso } from "../ports/sso";
import { createReminderActions } from "../reminder-actions";
import { mountReminderRoutes } from "../reminder-routes";
import { createMemoryStore, type MemoryStore } from "../store/memory";
import { COLLECTIONS, type StorePort } from "../store/types";
import { createTestIssuer, type MintOptions, type TestIssuer } from "./tokens";

/** Fixed: Friday 13 November 2026, 08:00 UTC (10:00 in Bucharest). */
export const NOW = Date.UTC(2026, 10, 13, 8, 0, 0);
export const HOUR = 3_600_000;
export const MASTER_KEY = "ab".repeat(32);
/** Signs the reminder links of the test world. */
export const LINK_SECRET = "reminder-link-secret-for-tests-0123456789";
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
	store: StorePort;
	authz: MemoryAuthz;
	mail: MemoryMailer;
	objects: MemoryObjects;
	notifier: MemoryNotify;
	/** The sign-in: accounts in memory, every call recorded, and a switch to make it unreachable. */
	sso: FakeSso;
	issuer: TestIssuer;
	/** What the reminder links told the notifier (`reminder.confirmed`, `reminder.declined`). */
	linkNotices: {
		app: string;
		event: string;
		payload: Record<string, unknown>;
		occurrence?: string;
	}[];
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
	/** Everything the store holds, as text (a refusal must leave it alone; secrets must not be in it). */
	dump(): Promise<string>;
	/** Everything the service holds that a refusal must leave alone: rows, change feed, audit, tuples, outbox, signed links. */
	fingerprint(): Promise<string>;
}

/** What a test world is built on: the in-memory store by default, or another adapter's (the contract runs both). */
export interface WorldOptions {
	store?: StorePort;
	/** The apps whose rows are dumped when the store cannot dump itself. */
	apps?: readonly string[];
	/** What a persistent store reports of its content cheaply (row counts per table): it stands for a full dump in a fingerprint. */
	storeDigest?: () => Promise<string>;
}

/** A store's rows, read through its own port: the same text for any adapter that holds the same data. */
async function dumpThroughPort(store: StorePort, apps: readonly string[]): Promise<string> {
	const rows: unknown[] = [];
	for (const app of apps) {
		for (const name of COLLECTIONS) {
			const list = await store.c[name].list(app).catch(() => []);
			rows.push([app, name, JSON.stringify(list.sort((a, b) => a.id.localeCompare(b.id)))]);
		}
		rows.push([app, "requests", await store.requests.list(app, 0, 8_640_000_000_000_000)]);
	}
	return JSON.stringify(rows);
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
		delivery: "send",
		store: { kind: "memory" },
		authz: { kind: "memory" },
		mail: undefined,
		objects: undefined,
		notify: undefined,
		sso: undefined,
		callerHashes: new Map(Object.entries(SECRETS).map(([id, secret]) => [id, hashSecret(secret)])),
	};
}

/** The service on every in-memory adapter, with no data: apps are created through the API like anywhere else. */
export async function createBareWorld(options: WorldOptions = {}): Promise<World> {
	const clock = { now: NOW };
	const issuer = await createTestIssuer(undefined, undefined, () => clock.now);
	const memory = options.store === undefined ? createMemoryStore(() => clock.now) : undefined;
	const store: StorePort = options.store ?? (memory as MemoryStore);
	const authz = createMemoryAuthz(platformAdminTuples("root"));
	const mail = createMemoryMailer();
	const objects = createMemoryObjects(() => clock.now);
	const notifier = createMemoryNotify();
	const sso = createFakeSso();
	const logs: LogEvent[] = [];
	const linkNotices: World["linkNotices"] = [];
	const usedLinks = createMemoryUsedLinks(() => clock.now);
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
		sso,
		links: {
			secret: LINK_SECRET,
			publicOrigin: "https://api-programari.test",
			consoleUrl: "https://clinic.test",
		},
		invites: mountInviteRoutes({
			secret: LINK_SECRET,
			actions: createInviteActions(store, sso, () => clock.now),
			now: () => clock.now,
		}),
		reminders: mountReminderRoutes({
			secret: LINK_SECRET,
			used: usedLinks,
			actions: createReminderActions(
				store,
				() => clock.now,
				() => "Strada Test 1",
			),
			notifier: {
				notify(app, event, payload, _to, occurrence) {
					linkNotices.push({
						app,
						event,
						payload,
						...(occurrence === undefined ? {} : { occurrence }),
					});
					return Promise.resolve({ status: "queued", jobs: 1 });
				},
			},
			now: () => clock.now,
		}),
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
		sso,
		issuer,
		linkNotices,
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
		dump: async () =>
			memory === undefined
				? dumpThroughPort(store, options.apps ?? ["psizone", "hemisync"])
				: memory.dump(),
		fingerprint: async () =>
			JSON.stringify([
				memory !== undefined
					? memory.dump()
					: options.storeDigest !== undefined
						? await options.storeDigest()
						: await dumpThroughPort(store, options.apps ?? ["psizone", "hemisync"]),
				authz
					.tuples()
					.map((t) => `${t.user}|${t.relation}|${t.object}`)
					.sort(),
				mail.outbox,
				objects.removed,
				notifier.sent,
				linkNotices,
				[...sso.accounts.values()],
			]),
	};
}
