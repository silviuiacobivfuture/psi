export const THEMES = ["hemisync-light", "hemisync-dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The theme a visitor chose (cookie), or Dawn: the brand's primary theme whatever the OS says. */
export function themeFrom(cookie: string | undefined): Theme {
	return THEMES.find((t) => t === cookie) ?? THEMES[0];
}
