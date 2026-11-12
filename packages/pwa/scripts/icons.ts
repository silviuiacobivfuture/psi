/**
 * The icon pipeline: each brand's mark, flat (no gradient, glow or grain), rendered to the
 * installable sizes under `apps/<site>/public/assets/pwa/`:
 *   icon-192.png, icon-512.png           purpose "any": a rounded tile on transparency
 *   maskable-192.png, maskable-512.png   purpose "maskable": full bleed, the mark inside the 80% safe zone
 *   apple-touch-icon.png                 180 × 180, opaque (iOS rounds it itself)
 *   badge-96.png                         the mark alone in white on transparency (Android's status bar)
 *
 * Psizone uses its own emblem (public/assets/brand/psizone-emblem-640.png, a grey + alpha mask)
 * in `on-accent` on the gold `accent`. EQ-SYNC and Hemi-Sync are typographic placeholders, like
 * their `Logo` (brand book §Logos), set in DejaVu (present on every build host); the blog's is
 * the solid disc the flat finish makes of its orb. Re-run with `pnpm --filter @psi/pwa icons`.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PWA_BRANDS, type PwaBrand, token } from "../src/brand";
import { ICON_FILES } from "../src/manifest";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const APP_DIR: Readonly<Record<PwaBrand, string>> = {
	psizone: "apps/psizone-web",
	eqsync: "apps/eqsync-web",
	hemisync: "apps/hemisync-web",
	blog: "apps/blog-web",
};

type Shape = "tile" | "bleed";

interface Design {
	ground: string;
	/** The mark as SVG elements on a 100 × 100 canvas, centred, sized for the given scale. */
	mark: (scale: number) => string;
}

/** The mark's share of the canvas: a tile has room to spare; maskable keeps it in the safe zone. */
const SCALE: Readonly<Record<Shape, number>> = { tile: 0.78, bleed: 0.66 };

const DESIGNS: Readonly<Record<Exclude<PwaBrand, "psizone">, Design>> = {
	eqsync: {
		ground: token("bg", "eqsync-dark"),
		mark: (s) =>
			`<g transform="translate(50 50) scale(${s})"><text x="-6" y="16" text-anchor="middle" font-family="DejaVu Sans Mono" font-weight="700" font-size="52" fill="${token("ink", "eqsync-dark")}">EQ</text><circle cx="38" cy="12" r="6" fill="${token("accent", "eqsync-dark")}"/></g>`,
	},
	hemisync: {
		ground: token("bg", "hemisync-dark"),
		mark: (s) =>
			`<g transform="translate(50 50) scale(${s})"><text x="0" y="14" text-anchor="middle" font-family="DejaVu Sans" font-weight="700" font-size="42" letter-spacing="6" fill="${token("ink", "hemisync-dark")}">HS</text><rect x="-34" y="26" width="68" height="4" fill="${token("accent", "hemisync-dark")}"/></g>`,
	},
	blog: {
		ground: token("bg", "blog-light"),
		mark: (s) =>
			`<circle cx="50" cy="50" r="${(40 * s).toFixed(2)}" fill="${token("glow-1", "blog-light")}"/>`,
	},
};

function svg(size: number, shape: Shape, ground: string, inner: string): Buffer {
	const radius = shape === "tile" ? 22 : 0;
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" rx="${radius}" fill="${ground}"/>${inner}</svg>`,
	);
}

/** Psizone: the emblem's alpha as a mask, filled with `on-accent`, centred on the gold ground. */
async function psizone(size: number, shape: Shape): Promise<Buffer> {
	const ground = token("accent", "psizone-dark");
	const ink = token("on-accent", "psizone-dark");
	const emblem = `${REPO}apps/psizone-web/public/assets/brand/psizone-emblem-640.png`;
	const width = Math.round(size * (shape === "tile" ? 0.7 : 0.62));
	const trimmed = await sharp(emblem).ensureAlpha().trim().png().toBuffer();
	const alpha = await sharp(trimmed)
		.extractChannel(3)
		.resize({ width, fit: "inside" })
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width: w, height: h } = alpha.info;
	const solid = await sharp({
		create: { width: w, height: h, channels: 3, background: ink },
	})
		.joinChannel(alpha.data, { raw: { width: w, height: h, channels: 1 } })
		.png()
		.toBuffer();
	return sharp(svg(size, shape, ground, ""))
		.composite([
			{ input: solid, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) },
		])
		.png()
		.toBuffer();
}

async function render(brand: PwaBrand, size: number, shape: Shape): Promise<Buffer> {
	if (brand === "psizone") return psizone(size, shape);
	const d = DESIGNS[brand];
	return sharp(svg(size, shape, d.ground, d.mark(SCALE[shape])))
		.png()
		.toBuffer();
}

/** iOS shows the touch icon on an opaque square; flatten onto the ground so no black corners appear. */
async function opaque(brand: PwaBrand, size: number): Promise<Buffer> {
	const ground = brand === "psizone" ? token("accent", "psizone-dark") : DESIGNS[brand].ground;
	return sharp(await render(brand, size, "bleed"))
		.flatten({ background: ground })
		.png()
		.toBuffer();
}

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** The mark's silhouette in white: Android draws the badge from its alpha only. */
async function badge(brand: PwaBrand, size: number): Promise<Buffer> {
	const mark =
		brand === "psizone"
			? await sharp(
					await sharp(`${REPO}apps/psizone-web/public/assets/brand/psizone-emblem-640.png`)
						.ensureAlpha()
						.trim()
						.resize({ width: size - 10, height: size - 10, fit: "contain", background: CLEAR })
						.png()
						.toBuffer(),
				)
					.extend({ top: 5, bottom: 5, left: 5, right: 5, background: CLEAR })
					.png()
					.toBuffer()
			: await sharp(svg(size, "bleed", "none", DESIGNS[brand].mark(0.95)))
					.png()
					.toBuffer();
	const alpha = await sharp(mark)
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

for (const brand of PWA_BRANDS) {
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
