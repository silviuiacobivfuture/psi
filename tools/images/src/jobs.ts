import type { Crop, Grade } from "./transform";

export type App = "psizone-web" | "eqsync-web" | "hemisync-web" | "blog-web";

/** One rendition of an image for one app: its crop, widths and byte budget. */
export interface Output {
	app: App;
	/** The manifest key; defaults to the image name in camelCase. */
	key?: string;
	crop?: Crop;
	/** Never above the cropped source: larger widths are dropped. */
	widths: ReadonlyArray<number>;
	/** hero: ≤ 120 KB AVIF at 1200w; other: ≤ 60 KB. */
	role: "hero" | "other";
	grade?: Grade;
	/** Below 1 calms a photo that would outshout the brand's palette. */
	saturation?: number;
}

export interface Job {
	/** The image's name in credits.json. */
	name: string;
	outputs: ReadonlyArray<Output>;
}

const WIDE = [480, 768, 1200, 1600] as const;
const CARD = [480, 768, 1200] as const;
const ARCH = [320, 480, 640, 960] as const;
const COVER = { aspect: 3 / 2 } as const;

/** Psizone's photographs: warm grade with lifted blacks (brand book). */
const pz = (
	key: string,
	crop: Crop,
	widths: ReadonlyArray<number>,
	role: Output["role"] = "other",
) => ({ app: "psizone-web", key, crop, widths, role, grade: "warm" }) as const;

const cover = (key: string, grade: Grade = "none"): Output => ({
	app: "blog-web",
	key,
	crop: COVER,
	widths: WIDE,
	role: "other",
	grade,
});

/** Every image the sites ship, and how each slot crops it. */
export const JOBS: ReadonlyArray<Job> = [
	// Psizone: real rooms, hands and materials in daylight; no faces, no brains.
	{
		name: "pz-hero-bead-toy",
		// Calmed so the toy's red and blue sit under the gold disc instead of fighting it.
		outputs: [
			{ ...pz("heroArch", { aspect: 5 / 6, y: 0.5 }, [320, 480, 640], "hero"), saturation: 0.62 },
		],
	},
	{ name: "pz-children-toys", outputs: [pz("childrenToys", { aspect: 2, y: 0.78 }, WIDE)] },
	{ name: "pz-adults-armchair", outputs: [pz("adultsArmchair", { aspect: 3 / 2 }, WIDE)] },
	{ name: "pz-story-danube-galati", outputs: [pz("storyDanube", { aspect: 2, y: 0.55 }, WIDE)] },
	{ name: "pz-team-window-books", outputs: [pz("teamRoom", { aspect: 2, y: 0.5 }, WIDE)] },

	// EQ-SYNC: night, headphones, a warm lamp in a dark room.
	{
		name: "eq-hero-headphones",
		outputs: [
			{ app: "eqsync-web", key: "hero", crop: { aspect: 16 / 9 }, widths: CARD, role: "hero" },
		],
	},
	{
		name: "eq-method-headphones",
		outputs: [
			{ app: "eqsync-web", key: "method", crop: { aspect: 3 / 2 }, widths: CARD, role: "other" },
		],
	},

	// Hemi-Sync: Romanian mountains at dawn and dusk, people small in the frame.
	{
		name: "hs-hero-carpathians",
		outputs: [{ app: "hemisync-web", key: "hero", widths: WIDE, role: "hero" }],
	},
	{
		name: "hs-gateway",
		outputs: [
			{ app: "hemisync-web", key: "gateway", crop: { aspect: 4 / 5 }, widths: ARCH, role: "other" },
		],
	},
	{
		name: "hs-synccreation",
		outputs: [
			{
				app: "hemisync-web",
				key: "syncCreation",
				crop: { aspect: 4 / 5, x: 0.74 },
				widths: ARCH,
				role: "other",
			},
		],
	},
	{
		name: "hs-lucid",
		outputs: [
			{ app: "hemisync-web", key: "lucid", crop: { aspect: 4 / 5 }, widths: ARCH, role: "other" },
		],
	},

	// Blog covers: one per article, in its brand's feel.
	{ name: "blog-psizone-editorial", outputs: [cover("psizoneEditorial", "warm")] },
	{ name: "blog-psizone-first-step", outputs: [cover("psizoneFirstStep", "warm")] },
	{ name: "blog-psizone-how-we-work", outputs: [cover("psizoneHowWeWork", "warm")] },
	{ name: "blog-eqsync-headphones", outputs: [cover("eqsyncHeadphones")] },
	{ name: "blog-eqsync-evening", outputs: [cover("eqsyncEvening")] },
	{ name: "blog-eqsync-night", outputs: [cover("eqsyncNight")] },
	{ name: "blog-hemisync-exercises", outputs: [cover("hemisyncExercises")] },
	{ name: "blog-hemisync-focus", outputs: [cover("hemisyncFocus")] },
];
