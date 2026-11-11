/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface AmbientFieldProps {
	intensity?: "low" | "medium" | "high";
	class?: string;
	style?: Record<string, string>;
	children?: Child;
}

const W = 1200;
const H = 400;

function waves(): [string, string] {
	let d1 = "M0 200";
	let d2 = "M0 230";
	for (let i = 0; i <= 60; i++) {
		const x = ((i * W) / 60).toFixed(0);
		d1 += ` L${x} ${(200 + Math.sin(i / 3.2) * 60 * Math.sin(i / 19)).toFixed(1)}`;
		d2 += ` L${x} ${(230 + Math.sin(i / 2.4 + 1) * 40 * Math.cos(i / 23)).toFixed(1)}`;
	}
	return [d1, d2];
}

const [WAVE_1, WAVE_2] = waves();

/** The living background behind heroes and the AI guide; each brand theme gives it its own feel. */
export function AmbientField({
	intensity = "medium",
	class: className,
	style,
	children,
}: AmbientFieldProps): JSX.Element {
	return (
		<div
			class={cx("pz-ambient", intensity !== "medium" && `pz-ambient--${intensity}`, className)}
			style={style}
		>
			<span class="pz-ambient__blob pz-ambient__blob--1" aria-hidden="true" />
			<span class="pz-ambient__blob pz-ambient__blob--2" aria-hidden="true" />
			<span class="pz-ambient__blob pz-ambient__blob--3" aria-hidden="true" />
			<svg
				class="pz-ambient__waves"
				viewBox={`0 0 ${W} ${H}`}
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<path d={WAVE_1} />
				<path d={WAVE_2} />
			</svg>
			<div class="pz-ambient__content">{children}</div>
		</div>
	);
}
