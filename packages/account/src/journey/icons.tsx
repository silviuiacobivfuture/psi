/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

/** The account sections' icons: Lucide-style strokes in `currentColor`, decorative (the label carries the name). */
export type AccountIconName =
	| "overview"
	| "profile"
	| "bookings"
	| "conversations"
	| "consents"
	| "data"
	| "saved";

const PATHS: Readonly<Record<AccountIconName, ReadonlyArray<string>>> = {
	overview: ["M3 10.5 12 3l9 7.5", "M5 9.5V20h5v-6h4v6h5V9.5"],
	profile: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M4 21a8 8 0 0 1 16 0"],
	bookings: [
		"M7 3v3",
		"M17 3v3",
		"M4 8h16",
		"M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1",
		"M9 14l2 2 4-4",
	],
	conversations: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12"],
	consents: [
		"M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z",
		"M9 12l2 2 4-4",
	],
	data: [
		"M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3",
		"M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6",
		"M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
	],
	saved: ["M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1"],
};

export function AccountIcon({
	name,
	class: className,
}: {
	name: AccountIconName;
	class?: string;
}): JSX.Element {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class={className}
		>
			{PATHS[name].map((d) => (
				<path d={d} />
			))}
		</svg>
	);
}
