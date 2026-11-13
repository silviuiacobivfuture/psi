import type { Pwa } from "@psi/pwa";
import { type ThemePreference, themeFor, themePreferenceFrom } from "@psi/ui/admin";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Person } from "../auth";
import type { ClinicPort } from "../port/port";
import { type AppSlug, AppSlugSchema, type Membership } from "../port/schema";
import { type Locale, localeFrom } from "./i18n";
import type { Theme } from "./theme";

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
	pwa: Pwa;
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
