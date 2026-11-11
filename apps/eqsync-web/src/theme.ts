export const THEMES = ["eqsync-dark", "eqsync-light"] as const;
export type Theme = (typeof THEMES)[number];

/** The theme a visitor chose (cookie), or the brand's primary one ("Night"). */
export function themeFrom(cookie: string | undefined): Theme {
	return THEMES.find((t) => t === cookie) ?? THEMES[0];
}
