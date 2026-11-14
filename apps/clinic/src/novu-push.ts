import { APP_KEYS } from "@psi/notify";
import { mountPushHook, NOVU_PUSH_PATH, syncDevices } from "@psi/notify/push";
import type { Pwa } from "@psi/pwa";
import type { Hono } from "hono";
import type { NovuSettings } from "./env";

export { NOVU_PUSH_PATH };

/** Keeps Novu's device tokens equal to the person's devices here, for each app a notification can come from. */
export function deviceSync(
	novu: NovuSettings,
	pwa: Pick<Pwa, "store">,
): (subject: string) => Promise<void> {
	// Staff are their own Novu subscribers: the estate subject is the id.
	return syncDevices(novu, pwa, "clinic", APP_KEYS, (_app, subject) => subject);
}

/** Mounts the push webhook when Novu has a push secret; the VAPID transport delivers what Novu decides. */
export function mountNovuPush(
	hono: Hono,
	pwa: Pick<Pwa, "store" | "transport">,
	novu: NovuSettings | null,
): void {
	mountPushHook(hono, pwa, novu, "clinic");
}
