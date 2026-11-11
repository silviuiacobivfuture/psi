/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { AmbientField } from "./ambient-field";

export interface ArticleCardProps {
	title: string;
	href: string;
	image?: string;
	topic?: string;
	excerpt?: string;
	/** Already composed and translated: author · reading time · reviewer. */
	meta?: string;
	class?: string;
}

export function ArticleCard({
	title,
	href,
	image,
	topic,
	excerpt,
	meta,
	class: className,
}: ArticleCardProps): JSX.Element {
	return (
		<a class={cx("pz-article", className)} href={href}>
			<div class="pz-article__media" aria-hidden={image ? undefined : "true"}>
				{image ? (
					<img src={image} alt="" />
				) : (
					<AmbientField intensity="high" style={{ height: "100%" }} />
				)}
			</div>
			<div class="pz-article__body">
				{topic ? <span class="pz-hub__eyebrow">{topic}</span> : null}
				<h3 class="pz-article__title">{title}</h3>
				{excerpt ? <p class="pz-article__excerpt">{excerpt}</p> : null}
				{meta ? <p class="pz-article__meta">{meta}</p> : null}
			</div>
		</a>
	);
}
