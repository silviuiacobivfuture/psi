import { z } from "zod";
import type { Locale } from "../locale";
import type { Cover, Topic } from "../schema";
import { COVER_ALT } from "./alt";
import { COVER_IMAGES, type CoverKey } from "./covers.generated";
import { type CoverAsset, CoverImage } from "./image";

/**
 * Articles that keep a cover of their own, picked by hand: the first eight, each in its brand's
 * feel. Every other article gets a photo from its topic's pool.
 */
export const EXPLICIT_COVERS: Readonly<Record<string, CoverKey>> = {
	"cum-scriem-si-revizuim-articolele": "psizoneEditorial",
	"primul-pas-ce-se-intampla-dupa-ce-ne-scrii": "psizoneFirstStep",
	"un-plan-o-echipa-cum-lucram": "psizoneHowWeWork",
	"de-ce-ai-nevoie-de-casti": "eqsyncHeadphones",
	"programul-gratuit-de-21-de-zile": "eqsyncEvening",
	"eqsync-ce-este-si-ce-nu-este": "eqsyncNight",
	"cum-incepi-exercitiile-gratuite-hemi-sync": "hemisyncExercises",
	"nivelurile-focus-pe-intelees": "hemisyncFocus",
};

/** 32-bit FNV-1a: stable across runs and machines, so a slug always lands on the same photo. */
export function stableHash(text: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

const KEYS: ReadonlyArray<CoverKey> = (Object.keys(COVER_IMAGES) as CoverKey[]).sort();

/** The photos of one topic's pool, in a fixed order. */
export function poolKeys(topic: Topic): ReadonlyArray<CoverKey> {
	const prefix = `cv-${topic}-`;
	return KEYS.filter((k) => k.startsWith(prefix));
}

/** The cover of an article: its explicit one, else a photo of its topic's pool by slug hash. */
export function coverKey(slug: string, topic: Topic): CoverKey | undefined {
	const explicit = EXPLICIT_COVERS[slug];
	if (explicit !== undefined) return explicit;
	const pool = poolKeys(topic);
	return pool[stableHash(slug) % Math.max(pool.length, 1)];
}

/** What a site needs to show an article's cover; the image is absolute when an origin is given. */
export const SummaryCover = z.discriminatedUnion("kind", [
	/** A photo of the blog's own library, in responsive formats. */
	z.object({ kind: z.literal("set"), alt: z.string(), image: CoverImage }),
	/** A single file the CMS holds. */
	z.object({ kind: z.literal("url"), alt: z.string(), src: z.string().url() }),
]);
export type SummaryCover = z.infer<typeof SummaryCover>;

function under(origin: string, image: CoverAsset): CoverImage {
	const prefix = (v: CoverAsset["avif"]) => v.map((x) => ({ width: x.width, src: origin + x.src }));
	return { ...image, avif: prefix(image.avif), webp: prefix(image.webp), jpeg: prefix(image.jpeg) };
}

/**
 * The cover to show for an article, in one locale. Precedence: the CMS's own cover, then the
 * hand-picked one, then the topic pool. `origin` prefixes the image paths ("" on the blog itself,
 * the blog's origin on the other sites). Null only if a topic has no pool at all.
 */
export function coverFor(
	a: { slug: string; topic: Topic; cover: Cover | null },
	locale: Locale,
	origin: string,
): SummaryCover | null {
	if (a.cover !== null) return { kind: "url", alt: a.cover.alt[locale], src: a.cover.src };
	const key = coverKey(a.slug, a.topic);
	if (key === undefined) return null;
	return { kind: "set", alt: COVER_ALT[key][locale], image: under(origin, COVER_IMAGES[key]) };
}
