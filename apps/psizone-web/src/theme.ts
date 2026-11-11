export const THEMES = ["psizone-dark", "psizone-light"] as const;
export type Theme = (typeof THEMES)[number];

/** The theme a visitor chose (cookie), or the brand's primary one. */
export function themeFrom(cookie: string | undefined): Theme {
	return THEMES.find((t) => t === cookie) ?? THEMES[0];
}
