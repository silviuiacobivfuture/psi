import sharp, { type Sharp } from "sharp";

/** Brand grades. Psizone: slightly warm with lifted blacks (brand book); the others stay true. */
export type Grade = "warm" | "night" | "none";

/** A crop to a ratio around a focal point (fractions of the source, 0..1). */
export interface Crop {
	aspect: number;
	x?: number;
	y?: number;
}

export interface Frame {
	image: Sharp;
	width: number;
	height: number;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/** Loads an original upright, crops it to the slot's ratio and applies the brand grade. */
export async function frame(
	path: string,
	crop: Crop | undefined,
	grade: Grade,
	saturation = 1,
): Promise<Frame> {
	const upright = await sharp(path).rotate().toBuffer({ resolveWithObject: true });
	const sw = upright.info.width;
	const sh = upright.info.height;
	let base = sharp(upright.data);
	let width = sw;
	let height = sh;
	if (crop) {
		const fx = crop.x ?? 0.5;
		const fy = crop.y ?? 0.5;
		if (sw / sh > crop.aspect) {
			width = Math.round(sh * crop.aspect);
			const left = Math.round(clamp(fx * sw - width / 2, 0, sw - width));
			base = base.extract({ left, top: 0, width, height });
		} else {
			height = Math.round(sw / crop.aspect);
			const top = Math.round(clamp(fy * sh - height / 2, 0, sh - height));
			base = base.extract({ left: 0, top, width, height });
		}
	}
	if (grade === "warm") {
		base = base
			.recomb([
				[1.03, 0.01, 0],
				[0, 1.0, 0],
				[0, 0, 0.95],
			])
			.linear(0.95, 9);
	} else if (grade === "night") {
		base = base.linear(0.97, 4);
	}
	if (saturation !== 1) base = base.modulate({ saturation });
	const data = await base.toColourspace("srgb").toBuffer();
	return { image: sharp(data), width, height };
}

/** The dominant colour as #rrggbb: the flat placeholder painted while the image loads. */
export async function dominant(image: Sharp): Promise<string> {
	const { dominant: d } = await image.clone().stats();
	const hex = (n: number) => n.toString(16).padStart(2, "0");
	return `#${hex(d.r)}${hex(d.g)}${hex(d.b)}`;
}
