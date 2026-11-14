/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

/**
 * The console's one pager: where a long list is (page numbers with first, previous, next and last), how much of it this
 * page shows ("1–50 din 216") and how many rows a page holds. Every control is a real link or a GET form, so a list
 * pages without JavaScript and every page has its own address (back, refresh and a shared link land on it). `live`
 * adds Datastar: the same address is fetched in place and the server patches the list, the pager and the address bar.
 * At phone width the numbers fold to "3 / 9" between the arrows.
 */

/** Everything the pager says, in the app's language (the library carries no words of its own). */
export interface PagerLabels {
	/** The navigation landmark, e.g. "Paginare clienți". */
	nav: string;
	first: string;
	prev: string;
	next: string;
	last: string;
	/** A page number's accessible name, e.g. "Pagina 3". */
	page: (n: number) => string;
	/** What is shown, e.g. "1–50 din 216". */
	range: (from: number, to: number, total: number) => string;
	/** The page size picker's label, e.g. "Pe pagină". */
	size: string;
	/** The size form's button, shown only without JavaScript. */
	apply: string;
}

export interface PagerProps {
	/** The element id (the server patches the pager by it). */
	id: string;
	/** 1-based. */
	page: number;
	size: number;
	total: number;
	/** The sizes offered, e.g. [25, 50, 100]. */
	sizes: ReadonlyArray<number>;
	/** The address of a page at a size, the list's search, filters and order kept. */
	href: (page: number, size: number) => string;
	/** Where the size form goes, and the list's other parameters it carries (not `page` nor `size`). */
	action: string;
	params: Readonly<Record<string, string>>;
	labels: PagerLabels;
	/** Datastar: links and the size picker fetch the list in place instead of loading a page. */
	live?: boolean;
}

/** How many pages a list of `total` rows has at `size` a page (one, even when empty). */
export const pageCount = (total: number, size: number): number =>
	Math.max(1, Math.ceil(total / size));

/**
 * The page numbers shown: the first, the last, and two either side of the current one; `null` is a gap ("…"). Seven
 * pages or fewer are all shown.
 */
export function pageWindow(page: number, pages: number): ReadonlyArray<number | null> {
	if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
	const near = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2]);
	const shown = [...near].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
	const out: (number | null)[] = [];
	for (const n of shown) {
		const prev = out.at(-1);
		if (typeof prev === "number" && n - prev === 2) out.push(n - 1);
		else if (typeof prev === "number" && n - prev > 2) out.push(null);
		out.push(n);
	}
	return out;
}

const fetchIn = (href: string): string => `@get('${href.replaceAll("'", "%27")}')`;

function Step({
	to,
	label,
	glyph,
	href,
	live,
	rel,
	cls,
}: {
	to: number | null;
	label: string;
	glyph: string;
	href: (page: number) => string;
	live: boolean;
	rel?: "prev" | "next";
	cls: string;
}): JSX.Element {
	if (to === null)
		return (
			<li class={`adm-pager__step ${cls}`}>
				<span class="adm-pager__link" aria-disabled="true" title={label}>
					<span aria-hidden="true">{glyph}</span>
					<span class="adm-sr">{label}</span>
				</span>
			</li>
		);
	const url = href(to);
	return (
		<li class={`adm-pager__step ${cls}`}>
			<a
				class="adm-pager__link"
				href={url}
				rel={rel}
				title={label}
				data-page={String(to)}
				data-on:click__prevent={live ? fetchIn(url) : undefined}
			>
				<span aria-hidden="true">{glyph}</span>
				<span class="adm-sr">{label}</span>
			</a>
		</li>
	);
}

export function Pager({
	id,
	page,
	size,
	total,
	sizes,
	href,
	action,
	params,
	labels,
	live = false,
}: PagerProps): JSX.Element {
	const pages = pageCount(total, size);
	const at = Math.min(Math.max(1, page), pages);
	const from = total === 0 ? 0 : (at - 1) * size + 1;
	const to = Math.min(total, at * size);
	const link = (n: number): string => href(n, size);
	return (
		<nav class="adm-pager" id={id} aria-label={labels.nav} data-pager={id}>
			<p class="adm-pager__range" aria-live="polite" data-range>
				{labels.range(from, to, total)}
			</p>
			{pages > 1 ? (
				<ul class="adm-pager__pages">
					<Step
						cls="adm-pager__end"
						to={at > 1 ? 1 : null}
						label={labels.first}
						glyph="«"
						href={link}
						live={live}
					/>
					<Step
						cls=""
						to={at > 1 ? at - 1 : null}
						label={labels.prev}
						glyph="‹"
						href={link}
						live={live}
						rel="prev"
					/>
					{pageWindow(at, pages).map((n, i) =>
						n === null ? (
							<li key={`gap-${i}`} class="adm-pager__num adm-pager__gap" aria-hidden="true">
								…
							</li>
						) : (
							<li key={String(n)} class="adm-pager__num">
								<a
									class="adm-pager__link"
									href={link(n)}
									aria-label={labels.page(n)}
									aria-current={n === at ? "page" : undefined}
									data-page={String(n)}
									data-on:click__prevent={live && n !== at ? fetchIn(link(n)) : undefined}
								>
									{String(n)}
								</a>
							</li>
						),
					)}
					<li class="adm-pager__compact" aria-hidden="true">
						{`${at} / ${pages}`}
					</li>
					<Step
						cls=""
						to={at < pages ? at + 1 : null}
						label={labels.next}
						glyph="›"
						href={link}
						live={live}
						rel="next"
					/>
					<Step
						cls="adm-pager__end"
						to={at < pages ? pages : null}
						label={labels.last}
						glyph="»"
						href={link}
						live={live}
					/>
				</ul>
			) : null}
			<form
				class="adm-pager__size"
				method="get"
				action={action}
				data-on:change={live ? `@get('${action}', {contentType: 'form'})` : undefined}
				data-on:submit__prevent={live ? `@get('${action}', {contentType: 'form'})` : undefined}
			>
				{Object.entries(params).map(([name, value]) => (
					<input key={name} type="hidden" name={name} value={value} />
				))}
				{/* The first row shown: the new size opens on the page that holds it. */}
				<input type="hidden" name="from" value={String(Math.max(0, from - 1))} />
				<label class="adm-pager__size-label">
					<span>{labels.size}</span>
					<select class="adm-input adm-pager__select" name="size">
						{sizes.map((s) => (
							<option key={String(s)} value={String(s)} selected={s === size}>
								{String(s)}
							</option>
						))}
					</select>
				</label>
				<noscript>
					<button class="adm-btn" type="submit">
						{labels.apply}
					</button>
				</noscript>
			</form>
		</nav>
	);
}
