import tokens from "@psi/design/tokens.json" with { type: "json" };

/** The four psi sites and the team console that ship as installable apps. */
export const PWA_BRANDS = ["psizone", "eqsync", "hemisync", "blog", "clinic"] as const;
export type PwaBrand = (typeof PWA_BRANDS)[number];

/** Each site's default theme (`themeFrom` with no cookie): the manifest's colours come from it. */
export const DEFAULT_THEME: Readonly<Record<PwaBrand, string>> = {
	psizone: "psizone-light",
	eqsync: "eqsync-dark",
	hemisync: "hemisync-light",
	blog: "blog-light",
	clinic: "admin-light",
};

/** One design token's value in one theme (`token("bg", "psizone-light")` → `#F4EEE2`). */
export function token(name: string, theme: string): string {
	const entry = tokens.color.tokens.find((t) => t.name === name);
	const value: unknown =
		entry === undefined ? undefined : Object.entries(entry.value).find(([id]) => id === theme)?.[1];
	if (typeof value !== "string") throw new Error(`design token ${name} has no value in ${theme}`);
	return value;
}

/** The manifest's colours: the default theme's canvas, as `<meta name="theme-color">` prints it. */
export function brandColours(brand: PwaBrand): { theme: string; background: string } {
	const bg = token("bg", DEFAULT_THEME[brand]);
	return { theme: bg, background: bg };
}
