/**
 * The icon pipeline: each brand's compact mark (packages/design/logos), flat, rendered to the
 * installable sizes under `apps/<site>/public/assets/pwa/`:
 *   icon-192.png, icon-512.png           purpose "any": a rounded tile on transparency
 *   maskable-192.png, maskable-512.png   purpose "maskable": full bleed, the mark inside the safe zone
 *   apple-touch-icon.png                 180 × 180, opaque (iOS rounds it itself)
 *   badge-96.png                         the mark alone in white on transparency (Android's status bar)
 *
 * The marks are the family's own (the same files as the favicons): Psizone's brain in its ring in
 * `on-accent` on the gold `accent`; the sisters in their lead and second hues on their ground.
 * Re-run with `pnpm --filter @psi/pwa icons`.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MARKS } from "@psi/design/logos";
import { live } from "@psi/ui";
import sharp from "sharp";
import { PWA_BRANDS, type PwaBrand, token } from "../src/brand";
import { ICON_FILES } from "../src/manifest";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const APP_DIR: Readonly<Record<PwaBrand, string>> = {
	psizone: "apps/psizone-web",
	eqsync: "apps/eqsync-web",
	hemisync: "apps/hemisync-web",
	blog: "apps/blog-web",
	clinic: "apps/clinic",
};

type Shape = "tile" | "bleed";

interface Design {
	ground: string;
	ink: string;
	ink2: string;
}

/** The mark's share of the canvas: a tile has room to spare; maskable keeps it in the safe zone. */
const SCALE: Readonly<Record<Shape, number>> = { tile: 0.82, bleed: 0.74 };

const DESIGNS: Readonly<Record<PwaBrand, Design>> = {
	psizone: {
		ground: token("accent", "psizone-dark"),
		ink: token("on-accent", "psizone-dark"),
		ink2: token("on-accent", "psizone-dark"),
	},
	eqsync: {
		ground: token("bg", "eqsync-dark"),
		ink: token("glow-1", "eqsync-dark"),
		ink2: token("glow-2", "eqsync-dark"),
	},
	hemisync: {
		ground: token("bg", "hemisync-dark"),
		ink: token("glow-1", "hemisync-dark"),
		ink2: token("glow-2", "hemisync-dark"),
	},
	blog: {
		ground: token("bg", "blog-light"),
		ink: token("glow-1", "blog-light"),
		ink2: token("glow-2", "blog-light"),
	},
	// The team console wears the Psizone mark, in the admin night theme's gold on its near-black ground.
	clinic: {
		ground: token("bg", "admin-dark"),
		ink: token("glow-1", "admin-dark"),
		ink2: token("glow-1", "admin-dark"),
	},
};

/** The compact mark as SVG on a 100 × 100 canvas, centred, in the design's two inks. */
function mark(brand: PwaBrand, scale: number, ink: string, ink2: string): string {
	const k = (100 * scale) / 64;
	const inner = MARKS[brand === "clinic" ? "psizone" : brand].compact.replaceAll(
		'class="t2"',
		`class="t2" color="${ink2}"`,
	);
	return `<g transform="translate(${(50 - 32 * k).toFixed(3)} ${(50 - 32 * k).toFixed(3)}) scale(${k.toFixed(4)})" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" color="${ink}">${inner}</g>`;
}

function svg(size: number, shape: Shape, ground: string, inner: string): Buffer {
	const radius = shape === "tile" ? 22 : 0;
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" rx="${radius}" fill="${ground}"/>${inner}</svg>`,
	);
}

async function render(brand: PwaBrand, size: number, shape: Shape): Promise<Buffer> {
	const d = DESIGNS[brand];
	return sharp(svg(size, shape, d.ground, mark(brand, SCALE[shape], d.ink, d.ink2)))
		.png()
		.toBuffer();
}

/** iOS shows the touch icon on an opaque square; flatten onto the ground so no black corners appear. */
async function opaque(brand: PwaBrand, size: number): Promise<Buffer> {
	return sharp(await render(brand, size, "bleed"))
		.flatten({ background: DESIGNS[brand].ground })
		.png()
		.toBuffer();
}

/** The mark's silhouette in white: Android draws the badge from its alpha only. */
async function badge(brand: PwaBrand, size: number): Promise<Buffer> {
	const silhouette = await sharp(
		svg(size, "bleed", "none", mark(brand, 0.95, "#FFFFFF", "#FFFFFF")),
	)
		.png()
		.toBuffer();
	const alpha = await sharp(silhouette)
		.ensureAlpha()
		.extractChannel(3)
		.raw()
		.toBuffer({ resolveWithObject: true });
	return sharp({ create: { width: size, height: size, channels: 3, background: "#FFFFFF" } })
		.joinChannel(alpha.data, {
			raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 },
		})
		.png()
		.toBuffer();
}

// A retired site (RETIRED_SITES) gets no icons: its app folder is left alone.
// `pnpm --filter @psi/pwa icons clinic` renders one brand only.
const only = process.argv[2];
for (const brand of live(PWA_BRANDS).filter((b) => only === undefined || b === only)) {
	const out = `${REPO}${APP_DIR[brand]}/public/assets/pwa`;
	mkdirSync(out, { recursive: true });
	for (const icon of ICON_FILES) {
		const file = `${out}/${icon.file}`;
		const png =
			icon.purpose === "apple"
				? await opaque(brand, icon.size)
				: icon.purpose === "badge"
					? await badge(brand, icon.size)
					: await render(brand, icon.size, icon.purpose === "maskable" ? "bleed" : "tile");
		await sharp(png).png({ compressionLevel: 9 }).toFile(file);
		console.log(`${brand}: ${APP_DIR[brand]}/public/assets/pwa/${icon.file}`);
	}
}
