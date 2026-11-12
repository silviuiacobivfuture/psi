import { type Article, coverFor } from "@psi/content";
import type { PictureSpec } from "@psi/ui";
import type { Locale } from "./i18n";

/**
 * The picture of an article, from @psi/content's one resolver (the CMS's own cover, a hand-picked
 * one, else a photo of the topic's pool), so the blog and the brand sites show the same photo.
 * The files are this app's own `/assets/images`, hence no origin.
 */

/** Where a cover shows: the article page (its LCP), the index's lead story, or a card. */
export type CoverSlot = "article" | "featured" | "card";

const SIZES: Readonly<Record<CoverSlot, string>> = {
	article: "(min-width: 920px) 880px, calc(100vw - 32px)",
	featured: "(min-width: 1200px) 640px, (min-width: 768px) 56vw, calc(100vw - 32px)",
	card: "(min-width: 1024px) 384px, (min-width: 640px) 46vw, calc(100vw - 32px)",
};

export interface CoverView {
	/** The responsive photo of the library. */
	picture?: PictureSpec;
	/** A single file from the CMS. */
	image?: { src: string; alt: string };
}

export function coverView(a: Article, locale: Locale, slot: CoverSlot): CoverView {
	const own = "cover" in a ? a.cover : null;
	const cover = coverFor({ slug: a.slug, topic: a.topic, cover: own }, locale, "");
	if (cover === null) return {};
	if (cover.kind === "url") return { image: { src: cover.src, alt: cover.alt } };
	return {
		picture: {
			image: cover.image,
			alt: cover.alt,
			sizes: SIZES[slot],
			priority: slot !== "card",
		},
	};
}
