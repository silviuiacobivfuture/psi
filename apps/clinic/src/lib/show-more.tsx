import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { sse } from "./sse";

/**
 * A list shown a page at a time: the page renders its first page and a "show more" under it; the button asks the list's
 * `…/more` route, which appends the next page into the open list (a Datastar patch), replaces the button (gone on the
 * last page) and the count. One piece for every list of the console, so they all page the same way.
 */

/** What a `…/more` route is asked: where the next page starts and how many rows the screen already shows. */
export const MoreQuery = z.object({
	cursor: z.string().max(400).catch(""),
	shown: z.coerce.number().int().min(0).max(1_000_000).catch(0),
});
export type MoreQuery = z.infer<typeof MoreQuery>;

/** The `…/more` address of the page after `cursor` (null: there is none), with the list's own parameters kept. */
export function moreHref(
	path: string,
	cursor: string | null,
	shown: number,
	params: Readonly<Record<string, string>> = {},
): string | null {
	if (cursor === null) return null;
	const q = new URLSearchParams({ ...params, cursor, shown: String(shown) });
	return `${path}?${q.toString()}`;
}

/** The button that fetches the next page into the list, or an empty placeholder (same id) once the last page is shown. */
export function ShowMore({
	id,
	href,
	label,
}: {
	id: string;
	href: string | null;
	label: string;
}): JSX.Element {
	return (
		<div id={id} class="list-more">
			{href === null ? null : (
				<button
					type="button"
					class="adm-btn"
					data-more={id}
					data-on:click={`@get('${href.replaceAll("'", "%27")}')`}
				>
					{label}
				</button>
			)}
		</div>
	);
}

/** The answer of a `…/more` route: the rows appended to the list, the button replaced, and the count (when the list has one). */
export async function appendPage(o: {
	/** The list's container, e.g. `#client-list`. */
	list: string;
	rows: ReadonlyArray<JSX.Element>;
	more: JSX.Element;
	count?: JSX.Element;
}): Promise<Response> {
	const rows = (await Promise.all(o.rows.map((r) => r.toString()))).join("");
	const more = await o.more.toString();
	const count = o.count === undefined ? null : await o.count.toString();
	return sse((stream) => {
		if (rows !== "") stream.patchElements(rows, { selector: o.list, mode: "append" });
		stream.patchElements(more);
		if (count !== null) stream.patchElements(count);
	});
}
