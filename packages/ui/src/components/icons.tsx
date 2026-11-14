/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

export interface IconProps {
	size?: number;
	class?: string;
}

/** Lucide-style arrow, decorative. */
export function ArrowIcon({ size = 18, class: className }: IconProps): JSX.Element {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class={className}
		>
			<path d="M5 12h14" />
			<path d="M13 6l6 6-6 6" />
		</svg>
	);
}

/** Lucide-style check mark, decorative. */
export function CheckIcon({ size = 14, class: className }: IconProps): JSX.Element {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class={className}
		>
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}
