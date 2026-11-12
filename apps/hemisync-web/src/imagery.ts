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
