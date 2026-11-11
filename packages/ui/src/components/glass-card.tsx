/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface GlassCardProps {
	solid?: boolean;
	class?: string;
	children?: Child;
}

/** Frosted panel for the ambient field or photography; `solid` on plain grounds. */
export function GlassCard({
	solid = false,
	class: className,
	children,
}: GlassCardProps): JSX.Element {
	return <div class={cx("pz-glass", solid && "pz-glass--solid", className)}>{children}</div>;
}
