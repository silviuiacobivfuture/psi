import {
	createSchedulingClient,
	createStaffSchedulingClient,
	DEFAULT_TIMEOUT_MS,
} from "@psi/scheduling";
import { ConvexClient } from "convex/browser";
import { createTokenVerifier } from "./auth/tokens";
import { createAccess } from "./authz/access";
import { createLiveAuthz } from "./authz/live";
import { createMemoryAuthz, type MemoryAuthz } from "./authz/memory";
import type { Config } from "./config";
import type { Deps, LogEvent } from "./http/context";
import { createFieldCrypto } from "./ports/crypto";
import { createHttpMailer } from "./ports/mail";
import { createLoggingNotify } from "./ports/notify";
import { createS3Store } from "./ports/objects";
import { createLimiter } from "./ports/ratelimit";
import { createConvexStore } from "./store/convex";
import { createRpc } from "./store/convex/rpc";
import { createMemoryStore } from "./store/memory";
import type { StorePort } from "./store/types";

const stdoutLog = (event: LogEvent): void => {
	process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
};

/** Wires the live adapters (or the in-memory ones the config allows outside production). */
export function buildDeps(config: Config, overrides: Partial<Deps> = {}): Deps {
	const store: StorePort =
		config.store.kind === "convex"
			? createConvexStore({
					rpc: createRpc({ url: config.store.url, serverKey: config.store.serverKey }),
					live: new ConvexClient(config.store.url, {
						skipConvexDeploymentUrlCheck: true,
						logger: false,
					}),
					serverKey: config.store.serverKey,
					visitor: createSchedulingClient({
						url: config.store.url,
						serverKey: config.store.serverKey,
						timeoutMs: DEFAULT_TIMEOUT_MS,
					}),
					staff: createStaffSchedulingClient({
						url: config.store.url,
						serverKey: config.store.serverKey,
						timeoutMs: DEFAULT_TIMEOUT_MS,
					}),
				})
			: createMemoryStore();
	const authz: Deps["authz"] | MemoryAuthz =
		config.authz.kind === "openfga"
			? createLiveAuthz({
					readUrl: config.authz.readUrl,
					writeUrl: config.authz.writeUrl,
					storeId: config.authz.storeId,
					modelId: config.authz.modelId,
					token: config.authz.token,
				})
			: createMemoryAuthz();
	const denials: Parameters<typeof createAccess>[1] = async (app, subject) =>
		new Set((await store.c.members.get(app, subject))?.denies ?? []);
	return {
		config,
		store,
		authz,
		access: createAccess(authz, denials),
		verifier: createTokenVerifier({ issuers: config.issuers }),
		crypto: createFieldCrypto(config.masterKey),
		mailer: config.mail === undefined ? undefined : createHttpMailer(config.mail),
		objects: config.objects === undefined ? undefined : createS3Store(config.objects),
		notifier: createLoggingNotify(stdoutLog),
		limiter: createLimiter({ capacity: 30, refillPerSecond: 5 }, Date.now),
		clock: Date.now,
		log: stdoutLog,
		streamHeartbeatMs: 15_000,
		...overrides,
	};
}
