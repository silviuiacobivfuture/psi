import { createBookingAccounts } from "@psi/account";
import { account } from "./account";
import { base } from "./i18n";

/**
 * The estate account in Psizone's booking and guide flows: pre-fill, the sign-in line, and the
 * account hash on the request so it appears in /cont/programari (see @psi/account's booking).
 */
export const { bookingAccount, guideForRequest } = createBookingAccounts({
	account,
	site: "psizone",
	base,
	listsRequests: true,
});
