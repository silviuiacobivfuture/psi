/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { ArrowIcon } from "./icons";

export type Hue = 1 | 2 | 3;

export interface HubCardProps {
	title: string;
	href: string;
	eyebrow?: string;
	text?: string;
	tags?: ReadonlyArray<string>;
	hue?: Hue;
	class?: string;
}

/** A door into a hub (a condition, a programme). Rotate `hue` 1-2-3 across a row. */
export function HubCard({
	title,
	href,
	eyebrow,
	text,
	tags = [],
	hue = 1,
	class: className,
}: HubCardProps): JSX.Element {
	return (
		<a class={cx("pz-hub", className)} href={href}>
			<span class={`pz-hub__glow pz-hub__glow--${hue}`} aria-hidden="true" />
			{eyebrow ? <span class="pz-hub__eyebrow">{eyebrow}</span> : null}
			<h3 class="pz-hub__title">{title}</h3>
			{text ? <p class="pz-hub__text">{text}</p> : null}
			<div class="pz-hub__foot">
				<div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
					{tags.map((t) => (
						<span class="pz-chip pz-chip--static pz-chip--accent">{t}</span>
					))}
				</div>
				<span class="pz-hub__arrow" aria-hidden="true">
					<ArrowIcon />
				</span>
			</div>
		</a>
	);
}
