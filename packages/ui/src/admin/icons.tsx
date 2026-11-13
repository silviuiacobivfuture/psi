/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

export const ADMIN_ICONS = [
	"calendar",
	"users",
	"inbox",
	"more",
	"plus",
	"search",
	"bell",
	"settings",
	"clock",
	"package",
	"list",
	"menu",
	"check",
	"x",
	"chevron-left",
	"chevron-right",
	"chevron-down",
	"sidebar",
	"chat",
	"mail",
	"archive",
	"trash",
	"shield",
	"briefcase",
	"alert",
	"wifi-off",
	"sun",
	"moon",
	"logout",
	"file",
	"user",
	"download",
] as const;
export type AdminIcon = (typeof ADMIN_ICONS)[number];

const PATHS: Readonly<Record<AdminIcon, string>> = {
	calendar:
		"M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
	users:
		"M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 15.2c1.8.6 3 2 3.5 4.8",
	inbox:
		"M4 13l2.2-7.2A1 1 0 0 1 7.1 5h9.8a1 1 0 0 1 .9.8L20 13M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5M4 13h4.5l1 2h5l1-2H20",
	more: "M5 12h.01M12 12h.01M19 12h.01",
	plus: "M12 5v14M5 12h14",
	search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
	bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4",
	settings:
		"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
	clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
	package: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
	list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
	menu: "M4 7h16M4 12h16M4 17h16",
	check: "M5 12.5l4.5 4.5L19 7.5",
	x: "M6 6l12 12M18 6L6 18",
	"chevron-left": "M14.5 6l-6 6 6 6",
	"chevron-right": "M9.5 6l6 6-6 6",
	"chevron-down": "M6 9.5l6 6 6-6",
	sidebar: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 5v14",
	chat: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",
	mail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3.5 6.5l8.5 6.5 8.5-6.5",
	archive: "M3 5h18v4H3zM5 9v10h14V9M10 13h4",
	trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
	shield: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z",
	briefcase:
		"M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 8V5h6v3M3 13h18",
	alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
	"wifi-off":
		"M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3.2-2M12 20h.01M19 12.5a10 10 0 0 0-7-2.6",
	sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
	moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
	logout: "M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9",
	file: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5",
	user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.7-3.6 3.6-5.5 7.5-5.5s6.8 1.9 7.5 5.5",
	download: "M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14",
};

export interface IconProps {
	name: AdminIcon;
	class?: string;
}

/** A 24px stroke icon in currentColor. Decorative: the label beside it carries the meaning. */
export function Icon({ name, class: className }: IconProps): JSX.Element {
	return (
		<svg
			class={className === undefined ? "adm-icon" : `adm-icon ${className}`}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<path d={PATHS[name]} />
		</svg>
	);
}
