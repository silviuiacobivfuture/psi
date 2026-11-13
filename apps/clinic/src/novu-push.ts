import { APP_KEYS } from "@psi/notify";
import { createDeviceSync, createPushHook } from "@psi/notify/push";
import type { Pwa } from "@psi/pwa";
import type { Hono } from "hono";
import type { NovuSettings } from "./env";

/** Where Novu's Push Webhook posts (it signs every call). */
export const NOVU_PUSH_PATH = "/__pwa/novu";

/** Keeps Novu's device tokens equal to the person's devices here, for each app a notification can come from. */
export function deviceSync(
	novu: NovuSettings,
	pwa: Pick<Pwa, "store">,
): (subject: string) => Promise<void> {
	return async (subject) => {
		const store = await pwa.store();
		await Promise.all(
			APP_KEYS.map((app) =>
				createDeviceSync({
					novu: { apiUrl: novu.apiUrl, secretKey: novu.secretKey },
					store,
					app,
					site: "clinic",
					// Staff are their own Novu subscribers: the estate subject is the id.
					subscriberOf: async (s) => s,
				})(subject),
			),
		);
	};
}

/** Mounts the push webhook when Novu has a push secret; the VAPID transport delivers what Novu decides. */
export function mountNovuPush(
	hono: Hono,
	pwa: Pick<Pwa, "store" | "transport">,
	novu: NovuSettings | null,
): void {
	if (novu === null || novu.pushSecret === null) return;
	hono.route(
		NOVU_PUSH_PATH,
		createPushHook({
			secret: novu.pushSecret,
			store: () => pwa.store(),
			transport: () => pwa.transport(),
			site: "clinic",
		}),
	);
}
