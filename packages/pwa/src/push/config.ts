import { z } from "zod";
import { readLocalVapid, type Vapid, VapidSchema } from "./local-vapid";
import type { PushStore } from "./store";
import { filePushStore } from "./store-file";
import { postgresPushStore } from "./store-postgres";

/**
 * Push configuration from the environment (OpenBao → ExternalSecret → env in the cluster; the
 * repository's gitignored `/.data/pwa/` on a workstation). docs/plans/pwa.md lists the paths:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT  ← secret/apps/pwa/vapid
 *   PWA_NOTIFY_SECRET                                   ← secret/apps/pwa/notify (the hook's HMAC key)
 *   PWA_DATABASE_URL (or ACCOUNT_DATABASE_URL)          ← the account database
 *
 * Three outcomes, so a site can ship before the keys are seeded:
 * - none of the push keys set (production): push is OFF — install and offline work, no
 *   "Notify me" anywhere, one log line;
 * - a complete set: push is on;
 * - a PARTIAL or malformed set: `readPushConfig` throws, and the site refuses to boot.
 * Outside production, no keys means the workstation's own pair and store under /.data/pwa/.
 * Values are never logged; a problem is named by key.
 */
const Env = z.object({
	NODE_ENV: z.string().optional(),
	VAPID_PUBLIC_KEY: z.string().optional(),
	VAPID_PRIVATE_KEY: z.string().optional(),
	VAPID_SUBJECT: z.string().optional(),
	PWA_NOTIFY_SECRET: z.string().optional(),
	PWA_DATABASE_URL: z.string().optional(),
	ACCOUNT_DATABASE_URL: z.string().optional(),
});

const PUSH_KEYS = [
	"VAPID_PUBLIC_KEY",
	"VAPID_PRIVATE_KEY",
	"VAPID_SUBJECT",
	"PWA_NOTIFY_SECRET",
] as const;

/** Thrown at boot for a partial or malformed push configuration: the message names keys only. */
export class PushConfigError extends Error {
	override readonly name = "PushConfigError";
}

export interface PushConfig {
	/** Null: push is off; the controls are not shown and the push API answers 503. */
	vapid: Vapid | null;
	notifySecret: string | null;
	store: () => Promise<PushStore>;
	storage: "postgres" | "file" | "off";
	/** Why push is off, for the one startup line; null when on. */
	off: string | null;
}

function postgresStore(url: string): () => Promise<PushStore> {
	let pending: Promise<PushStore> | null = null;
	return () => {
		pending ??= postgresPushStore(url).catch((err: unknown) => {
			pending = null;
			throw err;
		});
		return pending;
	};
}

const noStore = (): Promise<PushStore> =>
	Promise.reject(new PushConfigError("push is off: there is no subscription store"));

export function readPushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig {
	const e = Env.parse(
		Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== "")),
	);
	const production = e.NODE_ENV === "production";
	const present = PUSH_KEYS.filter((k) => e[k] !== undefined);
	const database = e.PWA_DATABASE_URL ?? e.ACCOUNT_DATABASE_URL;

	if (present.length === 0) {
		if (production) {
			return {
				vapid: null,
				notifySecret: null,
				store: noStore,
				storage: "off",
				off: "no VAPID keys configured",
			};
		}
		const local = readLocalVapid();
		return {
			vapid: local,
			notifySecret: null,
			store:
				database !== undefined ? postgresStore(database) : () => Promise.resolve(filePushStore()),
			storage: database !== undefined ? "postgres" : "file",
			off: local === null ? "no local VAPID pair (run `pnpm --filter @psi/pwa vapid`)" : null,
		};
	}

	const missing = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].filter(
		(k) => !present.some((p) => p === k),
	);
	if (missing.length > 0) {
		throw new PushConfigError(
			`push is partly configured: ${present.join(", ")} set but ${missing.join(", ")} missing`,
		);
	}
	const vapid = VapidSchema.safeParse({
		publicKey: e.VAPID_PUBLIC_KEY,
		privateKey: e.VAPID_PRIVATE_KEY,
		subject: e.VAPID_SUBJECT ?? "mailto:ops@psizone.ro",
	});
	if (!vapid.success) {
		throw new PushConfigError(
			`push is misconfigured: ${[...new Set(vapid.error.issues.map((i) => String(i.path[0])))].join(", ")} malformed`,
		);
	}
	if (e.PWA_NOTIFY_SECRET !== undefined && e.PWA_NOTIFY_SECRET.length < 32) {
		throw new PushConfigError(
			"push is misconfigured: PWA_NOTIFY_SECRET shorter than 32 characters",
		);
	}
	if (database === undefined && production) {
		throw new PushConfigError(
			"push is partly configured: VAPID keys set but PWA_DATABASE_URL/ACCOUNT_DATABASE_URL missing",
		);
	}
	return {
		vapid: vapid.data,
		notifySecret: e.PWA_NOTIFY_SECRET ?? null,
		store:
			database !== undefined ? postgresStore(database) : () => Promise.resolve(filePushStore()),
		storage: database !== undefined ? "postgres" : "file",
		off: null,
	};
}
