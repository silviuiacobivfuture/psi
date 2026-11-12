import { z } from "zod";
import { brandColours, type PwaBrand } from "./brand";

/** Where the icon pipeline writes and the manifest points: `public/assets/pwa/` → `/assets/pwa/`. */
export const ICON_BASE = "/assets/pwa";

/** Every icon the pipeline renders, and what each one is for. */
export const ICON_FILES = [
	{ file: "icon-192.png", size: 192, purpose: "any" },
	{ file: "icon-512.png", size: 512, purpose: "any" },
	{ file: "maskable-192.png", size: 192, purpose: "maskable" },
	{ file: "maskable-512.png", size: 512, purpose: "maskable" },
	{ file: "apple-touch-icon.png", size: 180, purpose: "apple" },
	{ file: "badge-96.png", size: 96, purpose: "badge" },
] as const;

export const APPLE_TOUCH_ICON = `${ICON_BASE}/apple-touch-icon.png`;

/** The words of one locale's manifest; the app supplies them from its Paraglide messages. */
export interface ManifestText {
	name: string;
	shortName: string;
	description: string;
}

export interface ManifestInput {
	brand: PwaBrand;
	/** BCP 47 (`ro`, `en`). */
	lang: string;
	/** This locale's home, e.g. `/` or `/en`. */
	startUrl: string;
	text: ManifestText;
}

const ManifestIcon = z.object({
	src: z.string().startsWith("/"),
	sizes: z.string().regex(/^\d+x\d+$/),
	type: z.literal("image/png"),
	purpose: z.enum(["any", "maskable"]),
});

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** What a browser needs to install the app (and what the tests hold every manifest to). */
export const WebAppManifestSchema = z
	.object({
		id: z.string().startsWith("/"),
		name: z.string().min(1).max(60),
		short_name: z.string().min(1).max(15),
		description: z.string().min(1),
		lang: z.string().min(2),
		dir: z.literal("ltr"),
		start_url: z.string().startsWith("/"),
		scope: z.literal("/"),
		display: z.literal("standalone"),
		orientation: z.literal("any"),
		theme_color: z.string().regex(HEX),
		background_color: z.string().regex(HEX),
		categories: z.array(z.string()),
		icons: z.array(ManifestIcon).min(4),
	})
	.strict()
	.refine((m) => m.icons.some((i) => i.sizes === "192x192" && i.purpose === "any"), {
		message: "a 192 × 192 icon is required",
	})
	.refine((m) => m.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"), {
		message: "a 512 × 512 icon is required",
	})
	.refine((m) => m.icons.some((i) => i.purpose === "maskable"), {
		message: "a maskable icon is required",
	})
	.refine((m) => m.start_url === "/" || m.start_url.startsWith(`${m.scope}`), {
		message: "start_url must sit inside scope",
	});
export type WebAppManifest = z.infer<typeof WebAppManifestSchema>;

const CATEGORIES: Readonly<Record<PwaBrand, ReadonlyArray<string>>> = {
	psizone: ["health", "medical"],
	eqsync: ["health", "lifestyle"],
	hemisync: ["lifestyle", "education"],
	blog: ["news", "health"],
};

/**
 * One locale's web app manifest. `id` is the same in every locale, so Romanian and English are
 * one installed app; `scope` is the site root; only `start_url`, `lang` and the words differ.
 */
export function buildManifest(input: ManifestInput): WebAppManifest {
	const colours = brandColours(input.brand);
	return WebAppManifestSchema.parse({
		id: "/",
		name: input.text.name,
		short_name: input.text.shortName,
		description: input.text.description,
		lang: input.lang,
		dir: "ltr",
		start_url: input.startUrl,
		scope: "/",
		display: "standalone",
		orientation: "any",
		theme_color: colours.theme,
		background_color: colours.background,
		categories: [...CATEGORIES[input.brand]],
		icons: ICON_FILES.filter((i) => i.purpose === "any" || i.purpose === "maskable").map((i) => ({
			src: `${ICON_BASE}/${i.file}`,
			sizes: `${i.size}x${i.size}`,
			type: "image/png",
			purpose: i.purpose,
		})),
	});
}
