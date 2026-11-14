import { createTokenVerifier } from "./auth/tokens";
import { createAccess } from "./authz/access";
import { createHeldKept, HELD_KEPT } from "./authz/held-kept";
import { createLiveAuthz } from "./authz/live";
import { createMemoryAuthz, type MemoryAuthz } from "./authz/memory";
import { type Config, deliversNotices } from "./config";
import type { Deps, LogEvent } from "./http/context";
import { wireNotify } from "./notify-wiring";
import { createFieldCrypto } from "./ports/crypto";
import { createHttpMailer } from "./ports/mail";
import { createS3Store } from "./ports/objects";
import { createLimiter } from "./ports/ratelimit";
import { createAuthentikSso } from "./ports/sso-authentik";
import { createAuthentikStaff } from "./ports/staff-authentik";
import { createMemoryStore } from "./store/memory";
import { openConvexStore } from "./store/open-convex";
import type { StorePort } from "./store/types";

const stdoutLog = (event: LogEvent): void => {
	process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
};

/** Wires the live adapters (or the in-memory ones the config allows outside production). */
export function buildDeps(config: Config, overrides: Partial<Deps> = {}): Deps {
	const opened =
		config.store.kind === "convex"
			? openConvexStore({ url: config.store.url, serverKey: config.store.serverKey })
			: undefined;
	const rpc = opened?.rpc;
	const store: StorePort = opened?.store ?? createMemoryStore();
	const authz: Deps["authz"] | MemoryAuthz =
		config.authz.kind === "openfga"
			? createLiveAuthz({
					readUrl: config.authz.readUrl,
					writeUrl: config.authz.writeUrl,
					storeId: config.authz.storeId,
					modelId: config.authz.modelId,
					token: config.authz.token,
					appPrefix: config.authz.appPrefix,
				})
			: createMemoryAuthz();
	const denials: Parameters<typeof createAccess>[1] = async (app, subject) =>
		new Set((await store.c.members.get(app, subject))?.denies ?? []);
	const clock = overrides.clock ?? Date.now;
	const access = overrides.access ?? createAccess(authz, denials);
	const sso = config.sso === undefined ? undefined : createAuthentikSso(config.sso);
	const staffGroup = config.sso?.staffGroup;
	const staff =
		config.sso === undefined || staffGroup === undefined
			? undefined
			: createAuthentikStaff({ ...config.sso, staffGroup });
	// Held delivery wires the notices as an instance without Novu does: logged by id, no link signed, nothing sent.
	const delivers = deliversNotices(config);
	const wiring = wireNotify({
		config: delivers ? config : { ...config, notify: undefined },
		store: overrides.store ?? store,
		access,
		sso: overrides.sso ?? sso,
		rpc,
		clock,
		log: stdoutLog,
	});
	return {
		config,
		store,
		authz,
		access,
		sso,
		staff,
		links:
			config.notify === undefined || !delivers
				? undefined
				: {
						secret: config.notify.reminderLinkSecret,
						publicOrigin: config.publicUrl,
						consoleUrl: config.notify.consoleUrl,
					},
		invites: wiring.invites,
		verifier: createTokenVerifier({ issuers: config.issuers }),
		crypto: createFieldCrypto(config.masterKey, (overrides.store ?? store).keys),
		mailer:
			config.mail === undefined || config.delivery === "hold"
				? undefined
				: createHttpMailer(config.mail),
		objects: config.objects === undefined ? undefined : createS3Store(config.objects),
		notifier: wiring.notifier,
		reminders: wiring.reminders,
		limiter: createLimiter({ capacity: 30, refillPerSecond: 5 }, Date.now),
		held: createHeldKept(HELD_KEPT),
		clock: Date.now,
		log: stdoutLog,
		streamHeartbeatMs: 15_000,
		...overrides,
	};
}
