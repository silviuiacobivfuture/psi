import { createAccount } from "@psi/account";
import { ORIGIN } from "./config";

/**
 * The console's sign-in: its own Authentik application `clinic` — the estate's one account, the same
 * single sign-on as the CMS and the sites. Configured from the environment (OIDC_CLIENT_ID, …).
 */
export const account = createAccount({
	site: { slug: "clinic", key: "clinic", origin: ORIGIN, home: "/calendar" },
});
