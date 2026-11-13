/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { type AdminIcon, Icon } from "./icons";

export interface SubNavItem {
	key: string;
	label: string;
	href: string;
	icon: AdminIcon;
	hint?: string;
}
export interface SubNavGroup {
	key: string;
	label: string;
	items: ReadonlyArray<SubNavItem>;
}
export interface SubNavProps {
	label: string;
	groups: ReadonlyArray<SubNavGroup>;
	/** The key of the open item; none: the landing, where every item shows its hint. */
	current?: string;
}

/**
 * A grouped list of links: the settings' left column beside a screen, and on its own (with hints) the landing a phone
 * opens first. Targets are 44px tall.
 */
export function SubNav({ label, groups, current }: SubNavProps): JSX.Element {
	return (
		<nav class="adm-subnav" aria-label={label}>
			{groups.map((g) => (
				<section key={g.key} class="adm-subnav__group">
					<h2 class="adm-subnav__title">{g.label}</h2>
					<ul class="adm-subnav__list">
						{g.items.map((i) => (
							<li key={i.key}>
								<a
									class="adm-subnav__item"
									href={i.href}
									data-subnav={i.key}
									aria-current={current === i.key ? "page" : undefined}
								>
									<Icon name={i.icon} />
									<span class="adm-subnav__text">
										<strong>{i.label}</strong>
										{current === undefined && i.hint !== undefined ? (
											<span class="adm-muted">{i.hint}</span>
										) : null}
									</span>
								</a>
							</li>
						))}
					</ul>
				</section>
			))}
		</nav>
	);
}
