/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

const PATHS = {
	spark:
		"M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z",
	send: "M5 12h14M13 6l6 6-6 6",
	close: "M6 6l12 12M18 6L6 18",
	check: "M5 12.5l4.5 4.5L19 7.5",
	undo: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
	plus: "M12 5v14M5 12h14",
} as const;

export type StaffIcon = keyof typeof PATHS;

export function SaIcon({ name, size = 18 }: { name: StaffIcon; size?: number }): JSX.Element {
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
		>
			<path d={PATHS[name]} />
		</svg>
	);
}
