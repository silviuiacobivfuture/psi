/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { AmbientField } from "./ambient-field";
import { Picture, type PictureSpec } from "./picture";

export interface ArticleCardProps {
	title: string;
	href: string;
	image?: string;
	/** What `image` shows; empty marks it decorative (the card's title already names the article). */
	imageAlt?: string;
	/** A responsive photograph (3:2); preferred over `image`. Without either, ambient art. */
	picture?: PictureSpec;
	topic?: string;
	excerpt?: string;
	/** Already composed and translated: author · reading time · reviewer. */
	meta?: string;
	/** A quiet marker before the metadata, e.g. "Draft": small, never the loudest thing on the card. */
	status?: string;
	class?: string;
}

export function ArticleCard({
	title,
	href,
	image,
	imageAlt = "",
	picture,
	topic,
	excerpt,
	meta,
	status,
	class: className,
}: ArticleCardProps): JSX.Element {
	return (
		<a class={cx("pz-article", className)} href={href}>
			<div
				class={cx("pz-article__media", picture && "pz-article__media--photo")}
				aria-hidden={image || picture ? undefined : "true"}
			>
				{picture ? (
					<Picture {...picture} class="pz-article__picture" imgClass="pz-article__img" />
				) : image ? (
					<img src={image} alt={imageAlt} loading="lazy" decoding="async" />
				) : (
					<AmbientField intensity="high" style={{ height: "100%" }} />
				)}
			</div>
			<div class="pz-article__body">
				{topic ? <span class="pz-hub__eyebrow">{topic}</span> : null}
				<h3 class="pz-article__title">{title}</h3>
				{excerpt ? <p class="pz-article__excerpt">{excerpt}</p> : null}
				{meta || status ? (
					<p class="pz-article__meta">
						{status ? <span class="pz-article__status">{status}</span> : null}
						{meta}
					</p>
				) : null}
			</div>
		</a>
	);
}
