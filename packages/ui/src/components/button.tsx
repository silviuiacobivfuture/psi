/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { ArrowIcon } from "./icons";

export interface ButtonProps {
	variant?: "primary" | "glass" | "ghost";
	size?: "sm" | "md" | "lg";
	arrow?: boolean;
	href?: string;
	type?: "button" | "submit";
	class?: string;
	attrs?: Record<string, string>;
	children?: Child;
}

/** Pill action. One primary per view. `href` renders a link. `attrs` carries data-* (Datastar). */
export function Button({
	variant = "primary",
	size = "md",
	arrow = false,
	href,
	type = "button",
	class: className,
	attrs = {},
	children,
}: ButtonProps): JSX.Element {
	const cls = cx("pz-btn", `pz-btn--${variant}`, size !== "md" && `pz-btn--${size}`, className);
	const content = (
		<>
			{children}
			{arrow ? <ArrowIcon class="pz-btn__arrow" /> : null}
		</>
	);
	return href ? (
		<a class={cls} href={href} {...attrs}>
			{content}
		</a>
	) : (
		<button class={cls} type={type} {...attrs}>
			{content}
		</button>
	);
}
