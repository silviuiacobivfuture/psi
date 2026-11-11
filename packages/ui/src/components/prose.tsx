/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

/** Long-form reading: Fraunces at text size, 680px measure. */
export function Prose({
	class: className,
	children,
}: {
	class?: string;
	children?: Child;
}): JSX.Element {
	return <div class={cx("pz-prose", className)}>{children}</div>;
}
