import type { Status } from "@psi/ui/admin";
import { m } from "../paraglide/messages.js";
import { at, type Locale } from "./i18n";

/** A status in the viewer's words (exhaustive: a new status fails the build here). */
export function statusLabel(status: Status, locale: Locale): string {
	const o = at(locale);
	switch (status) {
		case "confirmed":
			return m.status_confirmed({}, o);
		case "requested":
			return m.status_requested({}, o);
		case "cancelled":
			return m.status_cancelled({}, o);
		case "attended":
			return m.status_attended({}, o);
		case "no-show":
			return m.status_no_show({}, o);
		case "leave":
			return m.status_leave({}, o);
		case "medical-leave":
			return m.status_medical_leave({}, o);
		default: {
			const never: never = status;
			return never;
		}
	}
}
