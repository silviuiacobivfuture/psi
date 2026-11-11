/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface FilterChip {
	label: string;
	href: string;
	current?: boolean;
}

export interface FilterChipsProps {
	/** Accessible name of the filter group. */
	label: string;
	items: ReadonlyArray<FilterChip>;
	class?: string;
}

/** Filters as plain links (server-filtered, work without JS); the current one is marked for all. */
export function FilterChips({ label, items, class: className }: FilterChipsProps): JSX.Element {
	return (
		<nav class={cx("pz-filters", className)} aria-label={label}>
			{items.map((i) => (
				<a
					class="pz-chip pz-filters__chip"
					href={i.href}
					aria-current={i.current ? "page" : undefined}
				>
					{i.label}
				</a>
			))}
		</nav>
	);
}
