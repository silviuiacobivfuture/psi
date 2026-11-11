/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface StatusBadgeProps {
	tone?: "success" | "warning" | "danger" | "info" | "neutral";
	class?: string;
	children?: Child;
}

/** A status always carries a word, never colour alone. */
export function StatusBadge({
	tone = "neutral",
	class: className,
	children,
}: StatusBadgeProps): JSX.Element {
	return (
		<span class={cx("pz-status", `pz-status--${tone}`, className)}>
			<span class="pz-status__dot" aria-hidden="true" />
			<span style={{ color: "var(--ink)" }}>{children}</span>
		</span>
	);
}
