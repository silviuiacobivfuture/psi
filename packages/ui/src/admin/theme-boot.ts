/** Admin theme ids: the user's preference (light, dark, system) resolves to one of these. */
export const ADMIN_THEMES = ["admin-light", "admin-dark"] as const;
export type AdminTheme = (typeof ADMIN_THEMES)[number];
export type ThemePreference = "light" | "dark" | "system";

/** The saved navigation rail: "1" collapsed, "0" expanded, anything else no choice yet (the screen's default decides). */
export function railPreferenceFrom(cookie: string | undefined): boolean | null {
	return cookie === "1" ? true : cookie === "0" ? false : null;
}

export function themePreferenceFrom(cookie: string | undefined): ThemePreference {
	return cookie === "light" || cookie === "dark" ? cookie : "system";
}

/** What the server renders for a preference; `system` renders light and the boot script corrects it before paint. */
export function themeFor(pref: ThemePreference): AdminTheme {
	return pref === "dark" ? "admin-dark" : "admin-light";
}

/** Inline script for <head>: resolves `system` against the device's colour scheme before first paint. */
export const THEME_BOOT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);var p=m?m[1]:'system';if(p!=='light'&&p!=='dark'){p=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme='admin-'+p}catch(e){}})();`;
