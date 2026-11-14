import type { OrgProfileType } from "@psi/scheduling-sdk/contract";
import type { AppSlug } from "./schema";

/**
 * The organisation's contact profile, the scheduling service's contract as is: address, phones, e-mail, website, map
 * link, logo, opening hours, legal name and CUI.
 */
export {
	EMPTY_ORG_PROFILE,
	OrgProfile as OrgProfileSchema,
	WEEKDAYS,
	type Weekday,
} from "@psi/scheduling-sdk/contract";
export type OrgProfile = OrgProfileType;

/** The profile as read: an empty one at revision 0 while none was saved; `updatedAt` an ISO instant, or null. */
export interface OrgProfileView {
	revision: number;
	profile: OrgProfile;
	updatedAt: string | null;
}

/** A save from a revision the service has moved past is `stale`; one it refuses is `invalid`; nothing is written either way. */
export type OrgProfileSave =
	| { ok: true; view: OrgProfileView }
	| { ok: false; reason: "stale" | "invalid" };

export interface OrgPort {
	orgProfile(app: AppSlug): Promise<OrgProfileView>;
	/** Saves the whole profile edited from `revision`. */
	saveOrgProfile(app: AppSlug, revision: number, profile: OrgProfile): Promise<OrgProfileSave>;
}
