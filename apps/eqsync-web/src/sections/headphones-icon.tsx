import type { JSX } from "hono/jsx/jsx-runtime";

/** Headphones, line-art; decorative beside its label. */
export function HeadphonesIcon(): JSX.Element {
	return (
		<svg
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M4 15v-3a8 8 0 0 1 16 0v3" />
			<rect x="3" y="14" width="4.5" height="7" rx="1.5" />
			<rect x="16.5" y="14" width="4.5" height="7" rx="1.5" />
		</svg>
	);
}
