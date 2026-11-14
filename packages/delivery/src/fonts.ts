import { createRequire } from "node:module";

/**
 * psi's brand faces, self-hosted from `@psi/design/fonts` (SIL Open Font License 1.1, licences beside the files): the
 * Latin and Latin Extended subsets only, which hold every letter Romanian and English use (ă, â, î, ș, ț). Each subset
 * is its own file with its `unicode-range`, so an English page never downloads Latin Extended.
 */
export type FontFamily = "fraunces" | "manrope" | "ibm-plex-mono" | "inter";
type Subset = "latin" | "latin-ext";

const RANGES: Record<Subset, string> = {
	latin:
		"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
	"latin-ext":
		"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
};

interface Cut {
	/** The file stem in `@psi/design/fonts`, before `-<subset>.woff2`. */
	stem: string;
	style: "normal" | "italic";
	/** A single weight, or a variable font's range. */
	weight: string;
}

const FAMILIES: Record<FontFamily, { name: string; cuts: ReadonlyArray<Cut> }> = {
	fraunces: {
		name: "Fraunces",
		cuts: [
			{ stem: "fraunces", style: "normal", weight: "100 900" },
			{ stem: "fraunces-italic", style: "italic", weight: "100 900" },
		],
	},
	manrope: { name: "Manrope", cuts: [{ stem: "manrope", style: "normal", weight: "400 800" }] },
	"ibm-plex-mono": {
		name: "IBM Plex Mono",
		cuts: ["400", "500", "600"].map((w) => ({
			stem: `ibm-plex-mono-${w}`,
			style: "normal" as const,
			weight: w,
		})),
	},
	inter: { name: "Inter", cuts: [{ stem: "inter", style: "normal", weight: "400 700" }] },
};

/** One `@font-face`: where its file is on disk, the name it is served under, and the rule that names it. */
export interface FontFace {
	family: FontFamily;
	/** `fraunces-latin.woff2`: the served name, before the content hash. */
	file: string;
	path: string;
	style: "normal" | "italic";
	subset: Subset;
	rule(href: string): string;
}

const resolve = createRequire(import.meta.url).resolve;

/** Every face of these families, Latin before Latin Extended. */
export function fontFaces(families: ReadonlyArray<FontFamily>): ReadonlyArray<FontFace> {
	return families.flatMap((family) => {
		const { name, cuts } = FAMILIES[family];
		return cuts.flatMap((cut) =>
			(["latin", "latin-ext"] as const).map((subset) => {
				const file = `${cut.stem}-${subset}.woff2`;
				return {
					family,
					file,
					path: resolve(`@psi/design/fonts/${file}`),
					style: cut.style,
					subset,
					rule: (href: string) =>
						`@font-face{font-family:"${name}";font-style:${cut.style};font-weight:${cut.weight};font-display:swap;src:url(${href}) format("woff2");unicode-range:${RANGES[subset]}}`,
				};
			}),
		);
	});
}
