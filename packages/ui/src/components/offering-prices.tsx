/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { StatusBadge } from "./status-badge";

export interface OfferingPriceItem {
	title: string;
	/** The price already worded by the site (its i18n): "1.200 lei", "de la 300 lei", "la cerere". */
	price: string;
	summary?: string | null;
	note?: string | null;
	/** The site's word for a demonstration entry (local seed only), shown as a badge. */
	demoLabel?: string | null;
}

/**
 * Published prices from the CMS, as a quiet list: title and price on one line, the note under.
 * A site renders it only when the CMS has published a price; otherwise its placeholder stays.
 */
export function OfferingPrices({
	items,
	class: className,
}: {
	items: ReadonlyArray<OfferingPriceItem>;
	class?: string;
}): JSX.Element | null {
	if (items.length === 0) return null;
	return (
		<dl class={cx("divide-y divide-line border-y border-line", className)}>
			{items.map((x) => (
				<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
					<dt class="text-body text-ink">
						{x.title}
						{x.demoLabel ? (
							<StatusBadge tone="warning" class="ml-3 align-middle">
								{x.demoLabel}
							</StatusBadge>
						) : null}
						{x.summary ? (
							<span class="mt-1 block text-body-sm text-ink-muted">{x.summary}</span>
						) : null}
					</dt>
					<dd class="text-body font-semibold tabular-nums text-ink">
						{x.price}
						{x.note ? (
							<span class="block text-body-sm font-normal text-ink-muted">{x.note}</span>
						) : null}
					</dd>
				</div>
			))}
		</dl>
	);
}
