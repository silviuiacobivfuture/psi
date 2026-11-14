/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

/** One encoded width of an image. `src` is a site path, content-hashed by tools/images. */
export interface ImageVariant {
	readonly width: number;
	readonly src: string;
}

/**
 * An image as tools/images writes it into an app's generated manifest: AVIF, WebP and JPEG at
 * responsive widths, the exact intrinsic size of the largest width, and its dominant colour.
 */
export interface ImageAsset {
	readonly width: number;
	readonly height: number;
	/** The dominant colour, painted while the image loads (flat, no blur). */
	readonly placeholder: string;
	readonly avif: ReadonlyArray<ImageVariant>;
	readonly webp: ReadonlyArray<ImageVariant>;
	readonly jpeg: ReadonlyArray<ImageVariant>;
}

/** Where an image comes from, as tools/images copies it from packages/design/imagery/credits.json. */
export interface ImageCredit {
	/** The work's own title at its source (a proper name, not translated). */
	readonly title: string;
	readonly author: string;
	readonly sourceUrl: string;
	readonly licence: string;
	readonly licenceUrl: string;
	readonly attributionRequired: boolean;
	readonly modifications: string;
}

/** What a component needs to place a picture: the asset, its words, and how wide it shows. */
export interface PictureSpec {
	image: ImageAsset;
	/** User-facing, from the app's messages; an empty string marks the image as decorative. */
	alt: string;
	/** The rendered width per breakpoint, e.g. "(min-width: 1024px) 480px, 90vw". */
	sizes?: string;
	/** Only the page's LCP image: loads eagerly at high priority. */
	priority?: boolean;
	/** Above the fold but not the LCP: loads eagerly at the browser's own priority. */
	eager?: boolean;
	/** CSS object-position for a cropped frame, e.g. "50% 30%". */
	position?: string;
}

export interface PictureProps extends PictureSpec {
	/** On the `<picture>` element. */
	class?: string;
	/** On the `<img>` element (fit and frame classes). */
	imgClass?: string;
}

function srcset(variants: ReadonlyArray<ImageVariant>): string {
	return variants.map((v) => `${v.src} ${v.width}w`).join(", ");
}

/** The JPEG closest to 768px wide: the fallback for browsers that ignore `srcset`. */
function fallback(variants: ReadonlyArray<ImageVariant>): string {
	let best = variants[0];
	for (const v of variants) {
		if (best === undefined || Math.abs(v.width - 768) < Math.abs(best.width - 768)) best = v;
	}
	return best?.src ?? "";
}

/**
 * A responsive `<picture>`: AVIF, then WebP, then JPEG, with exact width and height so the box is
 * reserved before the bytes arrive (CLS 0). Lazy and async by default; `priority` is for the LCP
 * image alone.
 */
export function Picture({
	image,
	alt,
	sizes = "100vw",
	priority = false,
	eager = false,
	position,
	class: className,
	imgClass,
}: PictureProps): JSX.Element {
	const style = [
		`background-color:${image.placeholder}`,
		position ? `object-position:${position}` : "",
	]
		.filter(Boolean)
		.join(";");
	return (
		<picture class={cx("pz-picture", className)}>
			{/* A format with no variants (the old site's photographs have no AVIF) gets no empty <source>. */}
			{image.avif.length > 0 ? (
				<source type="image/avif" srcset={srcset(image.avif)} sizes={sizes} />
			) : null}
			{image.webp.length > 0 ? (
				<source type="image/webp" srcset={srcset(image.webp)} sizes={sizes} />
			) : null}
			<img
				class={cx("pz-picture__img", imgClass)}
				src={fallback(image.jpeg)}
				srcset={srcset(image.jpeg)}
				sizes={sizes}
				width={image.width}
				height={image.height}
				alt={alt}
				loading={priority || eager ? "eager" : "lazy"}
				decoding="async"
				fetchpriority={priority ? "high" : undefined}
				style={style}
			/>
		</picture>
	);
}
