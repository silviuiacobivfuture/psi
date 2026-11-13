/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { type AdminIcon, Icon } from "./icons";

export interface OverflowItem {
	key: string;
	label: string;
	icon?: AdminIcon;
	tone?: "danger";
	/** A link, or a Datastar expression run on click (e.g. `$askDelete = true`). */
	href?: string;
	onClick?: string;
}

export interface OverflowMenuProps {
	id: string;
	/** Names the "⋯" button ("More actions"). */
	label: string;
	items: ReadonlyArray<OverflowItem>;
}

/** Moves focus among the menu items; the keys a menu is expected to answer. */
const KEYS = `(() => {
  const items = [...el.querySelectorAll('[role=menuitem]')];
  const i = items.indexOf(document.activeElement);
  const to = (n) => { evt.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
  if (evt.key === 'ArrowDown') to(i + 1);
  else if (evt.key === 'ArrowUp') to(i - 1);
  else if (evt.key === 'Home') to(0);
  else if (evt.key === 'End') to(items.length - 1);
})()`.replace(/\s+/g, " ");

/** A "⋯" button and its menu: arrow keys move, Escape closes and gives focus back, a click outside closes. */
export function OverflowMenu({ id, label, items }: OverflowMenuProps): JSX.Element {
	const sig = `om_${id.replace(/\W/g, "_")}`;
	const trigger = `${sig}-btn`;
	return (
		<div
			class="adm-menu adm-overflow"
			data-signals={JSON.stringify({ [sig]: false })}
			data-on:click__outside={`$${sig} = false`}
			data-on:keydown={`evt.key === 'Escape' && $${sig} && ($${sig} = false, document.getElementById('${trigger}')?.focus())`}
		>
			<button
				type="button"
				id={trigger}
				class="adm-iconbtn"
				aria-haspopup="menu"
				aria-label={label}
				data-attr:aria-expanded={`$${sig}`}
				data-on:click={`$${sig} = !$${sig}; $${sig} && setTimeout(() => el.parentElement?.querySelector('[role=menuitem]')?.focus(), 0)`}
			>
				<Icon name="more" />
			</button>
			<div
				class="adm-menu__panel"
				role="menu"
				aria-labelledby={trigger}
				style="display:none"
				data-show={`$${sig}`}
				data-on:keydown={KEYS}
			>
				{items.map((i) =>
					i.href !== undefined ? (
						<a
							key={i.key}
							role="menuitem"
							class={cx("adm-menu__item", i.tone === "danger" && "adm-menu__item--danger")}
							href={i.href}
						>
							{i.icon === undefined ? null : <Icon name={i.icon} />}
							{i.label}
						</a>
					) : (
						<button
							key={i.key}
							type="button"
							role="menuitem"
							class={cx("adm-menu__item", i.tone === "danger" && "adm-menu__item--danger")}
							data-on:click={`$${sig} = false; ${i.onClick ?? ""}`}
						>
							{i.icon === undefined ? null : <Icon name={i.icon} />}
							{i.label}
						</button>
					),
				)}
			</div>
		</div>
	);
}
