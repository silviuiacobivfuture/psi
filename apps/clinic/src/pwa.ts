import { createPwa, type Identity, type Pwa } from "@psi/pwa";
import { m } from "./paraglide/messages.js";

/**
 * The console as an installable app: manifest in the admin theme's colours, the offline shell, the
 * install prompt, and the push subscription UI: the team's three purposes (requests, their appointments, the day-before
 * reminders), delivered through the estate's Novu. Every word is the console's own.
 */
export function createConsolePwa(
	origin: string,
	identity: Identity,
	options: { onDevicesChanged?: (subject: string) => Promise<void> } = {},
): Pwa {
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
		topics: ["requests", "appointments", "reminders"],
		identity,
		notificationsPath: () => "/me/settings",
		...(options.onDevicesChanged === undefined
			? {}
			: { onDevicesChanged: options.onDevicesChanged }),
	});
}
