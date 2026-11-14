import type { StaffEngine } from "@psi/engine/staff";
import type { Pwa } from "@psi/pwa";
import { type ThemePreference, themeFor, themePreferenceFrom } from "@psi/ui/admin";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Person } from "../auth";
import type { Notifications } from "../notifications/mount";
import type { Capabilities, ClinicPort } from "../port/port";
import { type AppSlug, AppSlugSchema, type AssistantMode, type Membership } from "../port/schema";
import type { Can } from "./can";
import { type Locale, localeFrom } from "./i18n";
import type { Theme } from "./theme";
import type { ViewAsState } from "./view-as";

/** Everything a page needs to know about the request it answers. */
export interface Ctx {
	c: Context;
	locale: Locale;
	pref: ThemePreference;
	theme: Theme;
	/** The decorative background: off unless the person turned it on. */
	deco: boolean;
	person: Person;
	app: AppSlug;
	memberships: ReadonlyArray<Membership>;
	port: ClinicPort;
	/** What the person may do in this app, asked of the service for THIS request (or the role they are viewing as). */
	caps: Capabilities;
	can: Can;
	/** Looking at the app as someone else (read-only), or null. */
	viewAs: ViewAsState | null;
	/** The person themselves (not the role they may be viewing as) is the estate's platform administrator. */
	platformAdmin: boolean;
	/** The person themselves (not the role they may be viewing as) administers roles, so "Vezi ca…" is theirs to use. */
	mayViewAs: boolean;
	pwa: Pwa;
	/** The staff assistant, when it is switched on. */
	assistant?: StaffEngine;
	/** How this person's assistant shows: the conversation bar or the side panel. */
	assistantMode: AssistantMode;
	/** The bell, when there is a feed behind it. */
	notifications?: Notifications;
	/** Where the sign-out form posts (the estate's sign-out, or the development no-op). */
	signOut: string;
}

export function activeApp(c: Context, memberships: ReadonlyArray<Membership>): AppSlug | null {
	const wanted = AppSlugSchema.safeParse(getCookie(c, "app"));
	const mine = memberships.map((m) => m.app);
	if (wanted.success && mine.includes(wanted.data)) return wanted.data;
	return mine[0] ?? null;
}

export function viewerPrefs(c: Context): {
	locale: Locale;
	pref: ThemePreference;
	theme: Theme;
	deco: boolean;
} {
	const pref = themePreferenceFrom(getCookie(c, "theme"));
	return {
		locale: localeFrom(getCookie(c, "lang")),
		pref,
		theme: themeFor(pref),
		deco: getCookie(c, "deco") === "on",
	};
}
