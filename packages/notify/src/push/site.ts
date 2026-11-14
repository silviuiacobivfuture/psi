import type { Pwa, SubscriptionRecord } from "@psi/pwa";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppKey } from "../apps";
import { createDeviceSync } from "./devices";
import { createPushHook } from "./hook";

/** Where Novu's Push Webhook posts on every psi site (it signs every call). */
export const NOVU_PUSH_PATH = "/__pwa/novu";

/** What a site needs to deliver Novu's pushes: the API and its key (device tokens), and the webhook's HMAC secret. */
export interface NovuPush {
	apiUrl: string;
	secretKey: string;
	/** Null: the devices are kept in step, but no webhook is mounted (nothing is delivered here). */
	pushSecret: string | null;
}

const PushEnv = z.object({
	NOVU_API_URL: z.string().url().optional(),
	NOVU_SECRET_KEY: z.string().min(10).optional(),
	NOVU_PUSH_SECRET: z.string().min(16).optional(),
});

/**
 * A site's Novu settings, from its environment: none at all is "push off" (the device list still works), a partial set
 * is refused loudly so a deploy that forgot a key never looks configured.
 */
export function readNovuPush(env: Readonly<Record<string, string | undefined>>): NovuPush | null {
	const e = PushEnv.parse(env);
	if (e.NOVU_API_URL === undefined && e.NOVU_SECRET_KEY === undefined) {
		if (e.NOVU_PUSH_SECRET !== undefined)
			throw new Error(
				"MISSING REQUIRED SETTING: NOVU_PUSH_SECRET needs NOVU_API_URL and NOVU_SECRET_KEY",
			);
		return null;
	}
	if (e.NOVU_API_URL === undefined || e.NOVU_SECRET_KEY === undefined)
		throw new Error("MISSING REQUIRED SETTING: NOVU_API_URL and NOVU_SECRET_KEY go together");
	return {
		apiUrl: e.NOVU_API_URL,
		secretKey: e.NOVU_SECRET_KEY,
		pushSecret: e.NOVU_PUSH_SECRET ?? null,
	};
}

/**
 * The `onDevicesChanged` of a site's PWA: keeps Novu's device tokens of the person equal to their devices here, for
 * each app a notification can come from. `subscriberOf` names the person in Novu (staff: their subject; a client with an
 * account: their account's client subscriber); undefined skips the app.
 */
export function syncDevices(
	novu: Pick<NovuPush, "apiUrl" | "secretKey">,
	pwa: Pick<Pwa, "store">,
	site: SubscriptionRecord["site"],
	apps: ReadonlyArray<AppKey>,
	subscriberOf: (app: AppKey, subject: string) => string | undefined,
	fetch?: typeof globalThis.fetch,
): (subject: string) => Promise<void> {
	return async (subject) => {
		const store = await pwa.store();
		await Promise.all(
			apps.map((app) =>
				createDeviceSync({
					novu: { ...novu, ...(fetch === undefined ? {} : { fetch }) },
					store,
					app,
					site,
					subscriberOf: async (s) => subscriberOf(app, s),
				})(subject),
			),
		);
	};
}

/** Mounts the push webhook when Novu has a push secret; the site's VAPID transport delivers what Novu decides. */
export function mountPushHook(
	hono: Hono,
	pwa: Pick<Pwa, "store" | "transport">,
	novu: NovuPush | null,
	site: SubscriptionRecord["site"],
): boolean {
	if (novu === null || novu.pushSecret === null) return false;
	hono.route(
		NOVU_PUSH_PATH,
		createPushHook({
			secret: novu.pushSecret,
			store: () => pwa.store(),
			transport: () => pwa.transport(),
			site,
		}),
	);
	return true;
}
