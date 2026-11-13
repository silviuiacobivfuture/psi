import { createPwa } from "@psi/pwa";
import { account } from "./account";
import { ORIGIN } from "./config";
import { m } from "./paraglide/messages.js";

/**
 * The console as an installable app: manifest in the admin theme's colours, the offline shell, the
 * install prompt, and the push subscription UI (sending comes later). Every word is the console's own.
 */
export const pwa = createPwa({
	brand: "clinic",
	origin: ORIGIN,
	origins: [ORIGIN],
	prefixes: { ro: "", en: "" },
	theme: "admin-light",
	messages: m,
	siteNames: () => ({ psizone: "Psizone", eqsync: "EQ-SYNC", hemisync: "Hemi-Sync", blog: "Blog" }),
	topics: ["booking"],
	identity: account,
	notificationsPath: () => "/more/notifications",
});
