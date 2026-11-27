import { raw } from "hono/html";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ROLES_MATRIX_PATH } from "./roles-matrix/path";

/**
 * The screens that only read: a link to one of them is fetched while the pointer rests on it (a touch: when it lands),
 * so the click opens a page already here instead of waiting for the service. Chrome keeps it a few minutes at most and
 * drops it when the cookies change.
 *
 * Left out on purpose: a client's own pages and a visit opened by `appt=` (the service writes a `clinical.read` audit
 * event for each: a hover must never be a reading), the audit journal and its export, every file download, and
 * `/switch/…` and `/view-as/…` (a GET that changes who the person is or what they see).
 */
const READS = [
	"/calendar",
	"/clients",
	"/requests",
	"/roster",
	"/reminders",
	"/stats",
	"/floor",
	"/more",
	"/settings",
	"/settings/*",
	"/me/*",
	"/account-links",
	"/platform",
	"/platform/*",
	ROLES_MATRIX_PATH,
] as const;

const NOT = [{ pathname: "/settings/audit*" }, { search: "*appt=*" }] as const;

export const SPECULATION_RULES = {
	prefetch: [
		{
			where: {
				and: [
					{ href_matches: READS.map((pathname) => ({ pathname })) },
					{ not: { href_matches: NOT } },
					{ not: { selector_matches: "[download], [target=_blank]" } },
				],
			},
			eagerness: "moderate",
		},
	],
} as const;

/** `</script>` cannot end the rules early: nothing in them can contain it, and the angle bracket is escaped anyway. */
const TEXT = JSON.stringify(SPECULATION_RULES).replaceAll("<", "\\u003c");

export function SpeculativeNav(): JSX.Element {
	return <script type="speculationrules">{raw(TEXT)}</script>;
}
