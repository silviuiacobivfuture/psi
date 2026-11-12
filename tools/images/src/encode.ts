import { createHash } from "node:crypto";
import type { Sharp } from "sharp";

export type Format = "avif" | "webp" | "jpeg";
export const FORMATS: ReadonlyArray<Format> = ["avif", "webp", "jpeg"];

/** Starting qualities, chosen by eye for photographs at these sizes. */
const QUALITY: Record<Format, number> = { avif: 52, webp: 74, jpeg: 76 };
/** The floor the budget search may lower to before the run fails. */
const FLOOR: Record<Format, number> = { avif: 36, webp: 58, jpeg: 62 };

export interface Encoded {
	format: Format;
	width: number;
	height: number;
	quality: number;
	data: Buffer;
	hash: string;
}

async function once(
	image: Sharp,
	format: Format,
	width: number,
	quality: number,
): Promise<{ data: Buffer; height: number }> {
	// sharp writes no metadata unless asked (no withMetadata): EXIF, GPS and ICC are stripped.
	let pipe = image.clone().resize({ width, withoutEnlargement: true });
	if (format === "avif") pipe = pipe.avif({ quality, effort: 6, chromaSubsampling: "4:2:0" });
	else if (format === "webp") pipe = pipe.webp({ quality, effort: 6, smartSubsample: true });
	else pipe = pipe.jpeg({ quality, mozjpeg: true, progressive: true });
	const out = await pipe.toBuffer({ resolveWithObject: true });
	return { data: out.data, height: out.info.height };
}

/**
 * Encodes one width; with a byte budget, lowers the quality in steps until it fits, and throws
 * when even the floor does not.
 */
export async function encode(
	image: Sharp,
	format: Format,
	width: number,
	opts: { budget?: number; quality?: number } = {},
): Promise<Encoded> {
	const { budget } = opts;
	let quality = opts.quality ?? QUALITY[format];
	for (;;) {
		const { data, height } = await once(image, format, width, quality);
		if (budget === undefined || data.length <= budget) {
			const hash = createHash("sha256").update(data).digest("hex").slice(0, 10);
			return { format, width, height, quality, data, hash };
		}
		if (quality - 4 < FLOOR[format]) {
			throw new Error(
				`${format} ${width}w is ${data.length} B at q${quality}, over the ${budget} B budget`,
			);
		}
		quality -= 4;
	}
}
