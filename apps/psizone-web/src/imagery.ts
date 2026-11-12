import type { PictureSpec } from "@psi/ui";
import type { HubGroup } from "./content/hubs";
import { at, type Locale } from "./i18n";
import { IMAGES } from "./images.generated";
import { m } from "./paraglide/messages.js";

/**
 * Psizone's photographs and their words. Free stock (credits: packages/design/imagery/credits.json),
 * chosen to show rooms, hands and materials, never a face, and never presented as the centre's own.
 */

/**
 * The hero arch: above the fold and, in fresh loads at 390px, the LCP element (the headline is split
 * into word spans, each smaller than the arch); at 1280px a headline word usually wins. It loads
 * eagerly at high priority: at about 6 KB it cannot delay the text.
 */
export function heroPicture(locale: Locale): PictureSpec {
	return {
		image: IMAGES.heroArch,
		alt: m.img_hero_alt({}, at(locale)),
		sizes: "(min-width: 1024px) 240px, 46vw",
		priority: true,
	};
}

/** The photograph that stands for a hub group (children; teens and adults). */
export function groupPicture(
	group: HubGroup,
	locale: Locale,
	sizes: string,
): PictureSpec | undefined {
	const o = at(locale);
	if (group === "children") {
		return {
			image: IMAGES.childrenToys,
			alt: m.img_children_alt({}, o),
			sizes,
			position: "50% 70%",
		};
	}
	if (group === "teens-adults") {
		return {
			image: IMAGES.adultsArmchair,
			alt: m.img_adults_alt({}, o),
			sizes,
			position: "60% 50%",
		};
	}
	return undefined;
}

export function storyPicture(locale: Locale): PictureSpec {
	return {
		image: IMAGES.storyDanube,
		alt: m.img_story_alt({}, at(locale)),
		sizes: "(min-width: 1152px) 1112px, calc(100vw - 40px)",
	};
}

export function teamPicture(locale: Locale): PictureSpec {
	return {
		image: IMAGES.teamRoom,
		alt: m.img_team_alt({}, at(locale)),
		sizes: "(min-width: 1152px) 1112px, calc(100vw - 40px)",
	};
}

/**
 * A photograph from the old psizone.ro, kept as one webp (public/images/old-site). The picture
 * element needs all three formats, so the jpeg list names the same webp file; every browser that
 * reads `srcset` reads webp. The frame colour while it loads is a surface token.
 */
export function oldSitePicture(
	file: string,
	width: number,
	height: number,
	alt: string,
	sizes: string,
): PictureSpec {
	const variant = [{ width, src: `/images/old-site/${file}.webp` }];
	return {
		image: {
			width,
			height,
			placeholder: "var(--surface-2)",
			avif: [],
			webp: variant,
			jpeg: variant,
		},
		alt,
		sizes,
	};
}
