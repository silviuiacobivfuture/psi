import type { PictureSpec } from "@psi/ui";
import { at, type Locale } from "./i18n";
import { IMAGES } from "./images.generated";
import { m } from "./paraglide/messages.js";

/**
 * EQ-SYNC's photographs: night, headphones, quiet light. Free stock, credited in
 * packages/design/imagery/credits.json (CC0: no attribution required).
 */

/** Beside the day numeral in the hero: eager (above the fold on desktop), but the h1 is the LCP. */
export function heroPicture(locale: Locale): PictureSpec {
	return {
		image: IMAGES.hero,
		alt: m.img_hero_alt({}, at(locale)),
		sizes: "(min-width: 1152px) 420px, (min-width: 1024px) 36vw, calc(100vw - 40px)",
		eager: true,
	};
}

export function methodPicture(locale: Locale): PictureSpec {
	return {
		image: IMAGES.method,
		alt: m.img_method_alt({}, at(locale)),
		sizes: "(min-width: 1152px) 440px, (min-width: 1024px) 38vw, calc(100vw - 40px)",
	};
}

/** Photographs beside a long page's sections: night skies, lamps, hands and sound. */
export const SECTION_PHOTOS = [
	"starsBlue",
	"mountainNight",
	"lakeStars",
	"moonTrees",
	"moonHalo",
	"lampNight",
	"vinylGrado",
	"quietLights",
	"readingBlanket",
	"pianistHands",
	"purpleSky",
	"turntableDark",
] as const;

export type SectionPhoto = (typeof SECTION_PHOTOS)[number];

type Alt = (inputs: Record<string, never>, options: { locale: Locale }) => string;

const SECTION_ALT: Readonly<Record<SectionPhoto, Alt>> = {
	starsBlue: m.img_stars_blue_alt,
	mountainNight: m.img_mountain_night_alt,
	lakeStars: m.img_lake_stars_alt,
	moonTrees: m.img_moon_trees_alt,
	moonHalo: m.img_moon_halo_alt,
	lampNight: m.img_lamp_night_alt,
	vinylGrado: m.img_vinyl_grado_alt,
	quietLights: m.img_quiet_lights_alt,
	readingBlanket: m.img_reading_blanket_alt,
	pianistHands: m.img_pianist_hands_alt,
	purpleSky: m.img_purple_sky_alt,
	turntableDark: m.img_turntable_dark_alt,
};

/** Lazy, below the fold: portrait (4:5) in the column beside the text, full width on a phone. */
export function sectionPicture(locale: Locale, photo: SectionPhoto): PictureSpec {
	return {
		image: IMAGES[photo],
		alt: SECTION_ALT[photo]({}, at(locale)),
		sizes:
			"(min-width: 1152px) 440px, (min-width: 1024px) 38vw, (min-width: 640px) 384px, calc(100vw - 40px)",
	};
}
