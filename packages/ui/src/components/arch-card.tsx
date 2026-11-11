/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import type { DawnImage } from "./dawn-landscape";
import { DawnRidges } from "./dawn-ridges";
import { ArrowIcon } from "./icons";

export interface ArchCardProps {
	/** Unique on the page: names the SVG gradients of the drawn window. */
	id: string;
	title: string;
	href: string;
	eyebrow?: string;
	text?: string;
	/** The link's words, e.g. "Detalii". */
	more?: string;
	/** A photograph in the arch; without one, a drawn landscape at the hue's hour. */
	image?: DawnImage;
	/** 1 dawn, 2 morning sky, 3 dusk. Rotate across a row. */
	hue?: 1 | 2 | 3;
	class?: string;
}

/** A programme seen through a window at dawn: arched media (999px 999px 24px 24px), then words. */
export function ArchCard({
	id,
	title,
	href,
	eyebrow,
	text,
	more,
	image,
	hue = 1,
	class: className,
}: ArchCardProps): JSX.Element {
	return (
		<a class={cx("hs-arch", `hs-arch--${hue}`, className)} href={href}>
			<span class="hs-arch__window">
				{image ? (
					<img
						class="hs-arch__img"
						src={image.src}
						alt={image.alt}
						srcset={image.srcset}
						sizes={image.sizes}
						loading="lazy"
						decoding="async"
					/>
				) : (
					<>
						<span class="hs-arch__sky" aria-hidden="true" />
						<DawnRidges id={id} class="hs-arch__ridges" />
					</>
				)}
				<span class="hs-mist hs-mist--soft" aria-hidden="true" />
			</span>
			<span class="hs-arch__body">
				{eyebrow ? <span class="hs-arch__eyebrow">{eyebrow}</span> : null}
				<span class="hs-arch__title">{title}</span>
				{text ? <span class="hs-arch__text">{text}</span> : null}
				{more ? (
					<span class="hs-arch__more">
						{more}
						<ArrowIcon size={16} />
					</span>
				) : null}
			</span>
		</a>
	);
}
