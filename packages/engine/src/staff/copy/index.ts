import type { StaffLocale } from "../model";
import { STAFF_EN } from "./en";
import { STAFF_RO } from "./ro";
import type { StaffCopy } from "./types";

export * from "./types";
export { STAFF_EN, STAFF_RO };

/** The copy for a locale: the engine's staff language data (Romanian and English). */
export function staffCopy(locale: StaffLocale): StaffCopy {
	return locale === "ro" ? STAFF_RO : STAFF_EN;
}
