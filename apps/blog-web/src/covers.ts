import type { ImageAsset, PictureSpec } from "@psi/ui";
import { at, type Locale } from "./i18n";
import { IMAGES } from "./images.generated";
import { m } from "./paraglide/messages.js";

/**
 * One cover per article, in its brand's feel: Psizone warm and human (hands, paper, no faces),
 * EQ-SYNC nocturnal (headphones, lamps), Hemi-Sync dawn and dusk in the Romanian mountains.
 * Free stock, credited in packages/design/imagery/credits.json (CC0). Articles without a cover keep
 * the brand's ambient art.
 */
const COVERS: Readonly<
	Record<string, { image: ImageAsset; alt: (o: { locale: Locale }) => string }>
> = {
	"cum-scriem-si-revizuim-articolele": {
		image: IMAGES.psizoneEditorial,
		alt: (o) => m.cover_psizone_editorial_alt({}, o),
	},
	"primul-pas-ce-se-intampla-dupa-ce-ne-scrii": {
		image: IMAGES.psizoneFirstStep,
		alt: (o) => m.cover_psizone_first_step_alt({}, o),
	},
	"un-plan-o-echipa-cum-lucram": {
		image: IMAGES.psizoneHowWeWork,
		alt: (o) => m.cover_psizone_how_we_work_alt({}, o),
	},
	"de-ce-ai-nevoie-de-casti": {
		image: IMAGES.eqsyncHeadphones,
		alt: (o) => m.cover_eqsync_headphones_alt({}, o),
	},
	"programul-gratuit-de-21-de-zile": {
		image: IMAGES.eqsyncEvening,
		alt: (o) => m.cover_eqsync_evening_alt({}, o),
	},
	"eqsync-ce-este-si-ce-nu-este": {
		image: IMAGES.eqsyncNight,
		alt: (o) => m.cover_eqsync_night_alt({}, o),
	},
	"cum-incepi-exercitiile-gratuite-hemi-sync": {
		image: IMAGES.hemisyncExercises,
		alt: (o) => m.cover_hemisync_exercises_alt({}, o),
	},
	"nivelurile-focus-pe-intelees": {
		image: IMAGES.hemisyncFocus,
		alt: (o) => m.cover_hemisync_focus_alt({}, o),
	},
};

/** Where a cover shows: the article's own page (its LCP) or the index's featured slot. */
export type CoverSlot = "article" | "featured";

const SIZES: Readonly<Record<CoverSlot, string>> = {
	article: "(min-width: 920px) 880px, calc(100vw - 40px)",
	featured: "(min-width: 1200px) 640px, (min-width: 768px) 56vw, calc(100vw - 40px)",
};

export function coverPicture(
	slug: string,
	locale: Locale,
	slot: CoverSlot,
): PictureSpec | undefined {
	const cover = COVERS[slug];
	if (cover === undefined) return undefined;
	return {
		image: cover.image,
		alt: cover.alt(at(locale)),
		sizes: SIZES[slot],
		priority: slot === "article",
	};
}
