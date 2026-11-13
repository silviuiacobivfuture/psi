import { createPwa, type Identity, type Pwa } from "@psi/pwa";
import { m } from "./paraglide/messages.js";

/**
 * The console as an installable app: manifest in the admin theme's colours, the offline shell, the
 * install prompt, and the push subscription UI (sending comes later). Every word is the console's own.
 */
export function createConsolePwa(origin: string, identity: Identity): Pwa {
	return createPwa({
		brand: "clinic",
		origin,
		origins: [origin],
		prefixes: { ro: "", en: "" },
		theme: "admin-light",
		messages: m,
		siteNames: () => ({
			psizone: "Psizone",
			eqsync: "EQ-SYNC",
			hemisync: "Hemi-Sync",
			blog: "Blog",
		}),
		topics: ["booking"],
		identity,
		notificationsPath: () => "/settings/notifications",
	});
}
