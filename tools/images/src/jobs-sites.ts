import type { Job, Output } from "./jobs";

/**
 * Photographs inside the long pages of EQ-SYNC and Hemi-Sync: 480 and 960 wide, AVIF held to 60 KB
 * at 960, fallbacks trimmed (WebP and JPEG at 480). EQ-SYNC frames them portrait (4:5) beside
 * the text; Hemi-Sync frames them landscape (4:3) under the section's heading.
 */
const SECTION_WIDTHS = [480, 960] as const;

const section = (
	app: "eqsync-web" | "hemisync-web",
	key: string,
	aspect: number,
	x = 0.5,
	y = 0.5,
): Output => ({
	app,
	key,
	crop: { aspect, x, y },
	widths: SECTION_WIDTHS,
	role: "other",
	budgetWidth: 960,
	fallbackMax: { webp: 480, jpeg: 480 },
});

const eq = (name: string, key: string, x?: number, y?: number): Job => ({
	name,
	outputs: [section("eqsync-web", key, 4 / 5, x, y)],
});

const hs = (name: string, key: string, x?: number, y?: number): Job => ({
	name,
	outputs: [section("hemisync-web", key, 4 / 3, x, y)],
});

export const SITE_PHOTO_JOBS: ReadonlyArray<Job> = [
	eq("eq-stars-blue", "starsBlue"),
	eq("eq-mountain-night", "mountainNight", 0.45),
	eq("eq-lake-stars", "lakeStars", 0.6),
	eq("eq-moon-trees", "moonTrees"),
	eq("eq-moon-halo", "moonHalo"),
	eq("eq-lamp-night", "lampNight", 0.3),
	eq("eq-vinyl-grado", "vinylGrado", 0.72),
	eq("eq-quiet-lights", "quietLights", 0.4),
	eq("eq-reading-blanket", "readingBlanket"),
	eq("eq-pianist-hands", "pianistHands", 0.55),
	eq("eq-purple-sky", "purpleSky"),
	eq("eq-turntable-dark", "turntableDark", 0.62),

	hs("hs-dusk-ridges", "duskRidges"),
	hs("hs-mist-hill", "mistHill"),
	hs("hs-cloud-hill", "cloudHill"),
	hs("hs-frost-firs", "frostFirs"),
	hs("hs-resting-sunset", "restingSunset", 0.7),
	hs("hs-ciucas-gold", "ciucasGold"),
	hs("hs-bench-dusk", "benchDusk"),
	hs("hs-misty-firs", "mistyFirs"),
	hs("hs-valley-mist", "valleyMist"),
	hs("hs-autumn-snow", "autumnSnow"),
	hs("hs-white-mist", "whiteMist", 0.6),
	hs("hs-cabin-autumn", "cabinAutumn"),
];
