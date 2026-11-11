/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { DawnRidges } from "./dawn-ridges";

export interface DawnImage {
	src: string;
	/** Required; an empty string marks the photo as decorative. */
	alt: string;
	srcset?: string;
	sizes?: string;
	width?: number;
	height?: number;
}

export interface DawnLandscapeProps {
	/** A landscape photograph. Without one, a drawn dawn (sky, ranges, sun) stands in. */
	image?: DawnImage;
	/** Unique on the page: names the SVG gradients. */
	id?: string;
	class?: string;
	children?: Child;
}

/**
 * The Hemi-Sync hero frame: inset 16px, 36px radius, a dawn landscape with slow mist rising.
 * With a photo the frame adds a top scrim and switches its content to light ink by itself.
 */
export function DawnLandscape({
	image,
	id = "hs-dawn",
	class: className,
	children,
}: DawnLandscapeProps): JSX.Element {
	return (
		<div class={cx("hs-dawn", image ? "hs-dawn--photo" : "hs-dawn--drawn", className)}>
			<div class="hs-dawn__media">
				{image ? (
					<img
						class="hs-dawn__img"
						src={image.src}
						alt={image.alt}
						srcset={image.srcset}
						sizes={image.sizes}
						width={image.width}
						height={image.height}
						fetchpriority="high"
						decoding="async"
					/>
				) : (
					<>
						<span class="hs-dawn__sky" aria-hidden="true" />
						<span class="hs-dawn__sun" aria-hidden="true" />
						<DawnRidges id={id} class="hs-dawn__ridges" />
					</>
				)}
			</div>
			<span class="hs-dawn__scrim" aria-hidden="true" />
			<span class="hs-mist" aria-hidden="true" />
			<span class="hs-mist hs-mist--far" aria-hidden="true" />
			<div class="hs-dawn__content">{children}</div>
		</div>
	);
}
