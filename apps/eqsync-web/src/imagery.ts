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
