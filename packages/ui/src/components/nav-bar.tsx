/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { Logo } from "./logo";

export interface NavLink {
	label: string;
	href: string;
	current?: boolean;
}

export interface NavBarProps {
	label: string;
	links: ReadonlyArray<NavLink>;
	homeHref: string;
	actions?: Child;
	class?: string;
}

export function NavBar({
	label,
	links,
	homeHref,
	actions,
	class: className,
}: NavBarProps): JSX.Element {
	return (
		<nav class={cx("pz-nav", className)} aria-label={label}>
			<Logo size={30} href={homeHref} />
			<div class="pz-nav__links">
				{links.map((l) => (
					<a href={l.href} aria-current={l.current ? "page" : undefined}>
						{l.label}
					</a>
				))}
			</div>
			<div class="pz-nav__actions">{actions}</div>
		</nav>
	);
}
