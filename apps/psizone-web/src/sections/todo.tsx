import { StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Localised } from "../content/localised";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/**
 * What the owner or the specialists still have to write, said plainly on the page: a dashed frame
 * (the same as the hero's photo placeholder), bracketed items, never a plausible-looking sentence.
 */
export function TodoBlock({
	locale,
	items,
	class: className = "",
}: {
	locale: Locale;
	items: ReadonlyArray<Localised>;
	class?: string;
}): JSX.Element | null {
	if (items.length === 0) return null;
	const o = at(locale);
	return (
		<aside
			class={`rounded-lg border border-dashed border-line-control bg-surface-1 p-6 md:p-8 ${className}`}
		>
			<StatusBadge tone="info">{m.todo_overline({}, o)}</StatusBadge>
			<p class="mt-4 max-w-xl text-body-sm text-ink-muted">{m.todo_text({}, o)}</p>
			<ul class="mt-5 space-y-2">
				{items.map((x) => (
					<li class="text-body text-ink-muted">{`[${x[locale]}]`}</li>
				))}
			</ul>
		</aside>
	);
}
