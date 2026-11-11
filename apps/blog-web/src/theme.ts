export const THEMES = ["blog-light", "blog-dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The theme a reader chose (cookie), or Paper, the Blog's primary one. */
export function themeFrom(cookie: string | undefined): Theme {
	return THEMES.find((t) => t === cookie) ?? THEMES[0];
}
