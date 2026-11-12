/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { AmbientField } from "./ambient-field";
import { Picture, type PictureSpec } from "./picture";

export interface ArticleCoverProps {
	/** A real photograph. Without one, the theme's ambient art stands in (decorative). */
	image?: { src: string; alt: string };
	/** A responsive photograph from the app's image manifest; preferred over `image`. */
	picture?: PictureSpec;
	/** Hue order of the ambient art, so neighbouring covers differ. */
	hue?: 1 | 2 | 3;
	class?: string;
	/** Optional overlay set on the art, e.g. a large typographic mark. */
	children?: Child;
}

/** One strong 3:2 cover at hero-media radius: a photo, or brand ambient art when there is none. */
export function ArticleCover({
	image,
	picture,
	hue = 1,
	class: className,
	children,
}: ArticleCoverProps): JSX.Element {
	return (
		<figure class={cx("pz-cover", `pz-cover--hue-${hue}`, className)}>
			{picture !== undefined ? (
				<Picture {...picture} class="pz-cover__picture" imgClass="pz-cover__img" />
			) : image !== undefined ? (
				<img src={image.src} alt={image.alt} loading="eager" decoding="async" />
			) : (
				<AmbientField class="pz-cover__art">
					<span class="pz-cover__rule" aria-hidden="true" />
					{children}
				</AmbientField>
			)}
		</figure>
	);
}
