import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** Previous / next as real links (no script): "Pagina 2 din 5" between them. */
export function Pager({
	page,
	pages,
	href,
	locale,
}: {
	page: number;
	pages: number;
	/** The URL of a page of the same listing. */
	href: (page: number) => string;
	locale: Locale;
}): JSX.Element | null {
	if (pages <= 1) return null;
	const o = at(locale);
	return (
		<nav class="bl-pager" aria-label={m.pager_label({}, o)}>
			{page > 1 ? (
				<a class="bl-more" rel="prev" href={href(page - 1)}>
					<span aria-hidden="true">←</span>
					{m.pager_prev({}, o)}
				</a>
			) : (
				<span />
			)}
			<span class="bl-meta">{m.pager_status({ page: String(page), total: String(pages) }, o)}</span>
			{page < pages ? (
				<a class="bl-more" rel="next" href={href(page + 1)}>
					{m.pager_next({}, o)}
					<span aria-hidden="true">→</span>
				</a>
			) : (
				<span />
			)}
		</nav>
	);
}
