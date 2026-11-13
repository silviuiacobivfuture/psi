/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { type AdminIcon, Icon } from "./icons";

export interface PaletteItem {
	/** The registry id of the action: tagged on the link so a test can tie the control to it. */
	id: string;
	label: string;
	icon: AdminIcon;
	href: string;
	/** What it sits under ("Client", "Go to"). */
	group: string;
}

export interface PaletteProps {
	/** The Datastar signal that opens it. */
	signal?: string;
	title: string;
	placeholder: string;
	closeLabel: string;
	empty: string;
	items: ReadonlyArray<PaletteItem>;
}

const FILTER = `(() => {
  const q = el.value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('[data-palette-item]').forEach((li) => {
    const hit = q === '' || (li.textContent || '').toLowerCase().includes(q);
    li.hidden = !hit;
    if (hit) shown++;
  });
  const none = document.getElementById('adm-palette-none');
  if (none) none.hidden = shown > 0;
})()`.replace(/\s+/g, " ");

/** The Ctrl/Cmd+K command palette: type to narrow, Enter or a tap opens; Escape closes. Full screen on a phone. */
export function CommandPalette({
	signal = "palette",
	title,
	placeholder,
	closeLabel,
	empty,
	items,
}: PaletteProps): JSX.Element {
	const groups = [...new Set(items.map((i) => i.group))];
	return (
		<div
			class="adm-palette"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			data-show={`$${signal}`}
			style="display:none"
			data-on:keydown={`evt.key === 'Escape' && ($${signal} = false)`}
		>
			<button
				type="button"
				class="adm-palette__scrim"
				tabindex={-1}
				aria-label={closeLabel}
				data-on:click={`$${signal} = false`}
			/>
			<div class="adm-palette__panel">
				<input
					id="adm-palette-q"
					class="adm-input"
					type="search"
					autocomplete="off"
					placeholder={placeholder}
					aria-label={placeholder}
					data-on:input={FILTER}
				/>
				<div class="adm-palette__list">
					{groups.map((g) => (
						<section key={g}>
							<h2 class="adm-palette__group">{g}</h2>
							<ul class="adm-palette__items">
								{items
									.filter((i) => i.group === g)
									.map((i) => (
										<li key={i.id} data-palette-item>
											<a class="adm-palette__item" href={i.href} data-action={i.id}>
												<Icon name={i.icon} />
												{i.label}
											</a>
										</li>
									))}
							</ul>
						</section>
					))}
					<p id="adm-palette-none" class="adm-muted" hidden>
						{empty}
					</p>
				</div>
			</div>
		</div>
	);
}

/** The keyboard shortcut that opens the palette, for a `data-on:keydown__window` on the shell. */
export const paletteShortcut = (signal = "palette"): string =>
	`(evt.key === 'k' || evt.key === 'K') && (evt.ctrlKey || evt.metaKey) && (evt.preventDefault(), $${signal} = !$${signal}, $${signal} && setTimeout(() => document.getElementById('adm-palette-q')?.focus(), 0))`;
