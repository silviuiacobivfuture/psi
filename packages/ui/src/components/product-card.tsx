/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { AmbientField } from "./ambient-field";

export interface ProductCardProps {
	title: string;
	price: string;
	kind?: string;
	text?: string;
	image?: string;
	badge?: string;
	/** The card's action, usually a small Button. */
	action: Child;
	class?: string;
}

export function ProductCard({
	title,
	price,
	kind,
	text,
	image,
	badge,
	action,
	class: className,
}: ProductCardProps): JSX.Element {
	return (
		<article class={cx("pz-product", className)}>
			<div class="pz-product__media">
				{image ? (
					<img src={image} alt="" />
				) : (
					<AmbientField intensity="high" style={{ height: "100%" }} />
				)}
				{badge ? <span class="pz-product__badge">{badge}</span> : null}
			</div>
			<div class="pz-product__body">
				{kind ? <span class="pz-hub__eyebrow">{kind}</span> : null}
				<h3 class="pz-product__title">{title}</h3>
				{text ? <p class="pz-product__text">{text}</p> : null}
				<div class="pz-product__foot">
					<span class="pz-product__price">{price}</span>
					{action}
				</div>
			</div>
		</article>
	);
}
