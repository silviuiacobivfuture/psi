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
	/** Accessible name of the phone menu button; when set, narrow screens fold the nav into a sheet. */
	menuLabel?: string;
	class?: string;
}

function Links({ links }: { links: ReadonlyArray<NavLink> }): JSX.Element {
	return (
		<>
			{links.map((l) => (
				<a href={l.href} aria-current={l.current ? "page" : undefined}>
					{l.label}
				</a>
			))}
		</>
	);
}

/** The floating pill nav. With `menuLabel`, phones get a menu button and a glass sheet (Datastar). */
export function NavBar({
	label,
	links,
	homeHref,
	actions,
	menuLabel,
	class: className,
}: NavBarProps): JSX.Element {
	return (
		<nav
			class={cx("pz-nav", menuLabel !== undefined && "pz-nav--foldable", className)}
			aria-label={label}
			data-signals="{navOpen: false}"
			data-on:keydown__window="evt.key === 'Escape' && ($navOpen = false)"
		>
			<Logo size={30} href={homeHref} />
			<div class="pz-nav__links">
				<Links links={links} />
			</div>
			<div class="pz-nav__actions">{actions}</div>
			{menuLabel !== undefined ? (
				<>
					<button
						type="button"
						class="pz-nav__menu"
						aria-label={menuLabel}
						aria-expanded="false"
						aria-controls="pz-nav-sheet"
						data-attr:aria-expanded="$navOpen ? 'true' : 'false'"
						data-on:click="$navOpen = !$navOpen"
					>
						<svg
							width="22"
							height="22"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<path d="M4 8h16" data-attr:d="$navOpen ? 'M6 6l12 12' : 'M4 8h16'" />
							<path d="M4 16h16" data-attr:d="$navOpen ? 'M6 18L18 6' : 'M4 16h16'" />
						</svg>
					</button>
					<div
						id="pz-nav-sheet"
						class="pz-nav__sheet"
						style={{ display: "none" }}
						data-show="$navOpen"
						data-on:click="evt.target.closest('a') && ($navOpen = false)"
					>
						<div class="pz-nav__sheet-links">
							<Links links={links} />
						</div>
						<div class="pz-nav__sheet-actions">{actions}</div>
					</div>
				</>
			) : null}
		</nav>
	);
}
