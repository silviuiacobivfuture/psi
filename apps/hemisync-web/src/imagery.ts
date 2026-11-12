import type { PictureSpec } from "@psi/ui";
import { at, type Locale } from "./i18n";
import { IMAGES } from "./images.generated";
import { m } from "./paraglide/messages.js";
import type { ProgrammeSlug } from "./routes";

/**
 * Hemi-Sync's photographs: Romanian mountains at dawn and dusk, people small in the frame. Free
 * stock, credited in packages/design/imagery/credits.json (CC0: no attribution required).
 */

/** The hero fills the screen: the LCP image, so it loads at high priority. */
export function heroPicture(locale: Locale): PictureSpec {
	return {
		image: IMAGES.hero,
		alt: m.img_hero_alt({}, at(locale)),
		sizes: "calc(100vw - 32px)",
		priority: true,
		position: "50% 60%",
	};
}

/** One photograph per programme, seen through its arch (4:5). */
export function programmePicture(locale: Locale, slug: ProgrammeSlug): PictureSpec {
	const o = at(locale);
	const sizes =
		"(min-width: 1280px) 360px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, calc(100vw - 48px)";
	switch (slug) {
		case "gateway-voyage":
			return { image: IMAGES.gateway, alt: m.img_gateway_alt({}, o), sizes };
		case "sync-creation":
			return { image: IMAGES.syncCreation, alt: m.img_synccreation_alt({}, o), sizes };
		case "lucid-dreaming":
			return { image: IMAGES.lucid, alt: m.img_lucid_alt({}, o), sizes };
	}
}

/** Photographs under a long page's section headings: Carpathian light, mist and quiet figures. */
export const SECTION_PHOTOS = [
	"duskRidges",
	"mistHill",
	"cloudHill",
	"frostFirs",
	"restingSunset",
	"ciucasGold",
	"benchDusk",
	"mistyFirs",
	"valleyMist",
	"autumnSnow",
	"whiteMist",
	"cabinAutumn",
] as const;

export type SectionPhoto = (typeof SECTION_PHOTOS)[number];

type Alt = (inputs: Record<string, never>, options: { locale: Locale }) => string;

const SECTION_ALT: Readonly<Record<SectionPhoto, Alt>> = {
	duskRidges: m.img_dusk_ridges_alt,
	mistHill: m.img_mist_hill_alt,
	cloudHill: m.img_cloud_hill_alt,
	frostFirs: m.img_frost_firs_alt,
	restingSunset: m.img_resting_sunset_alt,
	ciucasGold: m.img_ciucas_gold_alt,
	benchDusk: m.img_bench_dusk_alt,
	mistyFirs: m.img_misty_firs_alt,
	valleyMist: m.img_valley_mist_alt,
	autumnSnow: m.img_autumn_snow_alt,
	whiteMist: m.img_white_mist_alt,
	cabinAutumn: m.img_cabin_autumn_alt,
};

/** Lazy, below the fold: landscape (4:3) in the heading column, full width on a phone. */
export function sectionPicture(locale: Locale, photo: SectionPhoto): PictureSpec {
	return {
		image: IMAGES[photo],
		alt: SECTION_ALT[photo]({}, at(locale)),
		sizes: "(min-width: 1280px) 470px, (min-width: 1024px) 38vw, calc(100vw - 48px)",
	};
}
