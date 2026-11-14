import { AccountLinkSuggestion } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";

/**
 * An online account whose booking matched clinic clients without certainty, as the scheduling service answers it: its
 * id (the account's hash), whether the e-mail or the phone matched, the request that showed it, and the candidates.
 */
export const AccountLinkSchema = AccountLinkSuggestion;
export type AccountLink = z.output<typeof AccountLinkSuggestion>;
