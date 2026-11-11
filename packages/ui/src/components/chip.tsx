/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface ChipProps {
	tone?: "accent" | "ai" | "warm" | "neutral";
	/** When set, the chip is a toggle button (aria-pressed); `attrs` carries its Datastar wiring. */
	selected?: boolean;
	attrs?: Record<string, string>;
	class?: string;
	children?: Child;
}

export function Chip({
	tone = "neutral",
	selected,
	attrs = {},
	class: className,
	children,
}: ChipProps): JSX.Element {
	if (selected !== undefined) {
		return (
			<button
				type="button"
				class={cx("pz-chip", className)}
				aria-pressed={selected ? "true" : "false"}
				{...attrs}
			>
				{children}
			</button>
		);
	}
	return (
		<span class={cx("pz-chip", "pz-chip--static", `pz-chip--${tone}`, className)}>{children}</span>
	);
}
