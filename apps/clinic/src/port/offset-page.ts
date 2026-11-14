import { pageStart } from "@psi/scheduling/clinic";
import type { Numbered, PageAsk, Paged } from "./port";

/** An offset into the whole answer, as text (anything else: the start). */
export const offsetOf = (cursor: string | null): number => {
	const n = cursor === null ? 0 : Number.parseInt(cursor, 10);
	return Number.isInteger(n) && n >= 0 ? n : 0;
};

/**
 * One page of a list that is read whole — the in-memory clinic's lists, or a list bounded by its own nature (one day's
 * reminders) — with an offset cursor: the same pages and the same "no cursor on the last page" as the service's.
 */
export function offsetPage<T>(
	all: ReadonlyArray<T>,
	cursor: string | null,
	size: number,
): Paged<T> {
	const start = offsetOf(cursor);
	const items = all.slice(start, start + size);
	const end = start + items.length;
	return { items, nextCursor: end < all.length ? String(end) : null };
}

/** One numbered page of a list held whole (the page past the end: the last), with how many there are in all. */
export function numberedPage<T>(all: ReadonlyArray<T>, ask: PageAsk): Numbered<T> {
	const start = pageStart((ask.page - 1) * ask.size, ask.size, all.length);
	return {
		items: all.slice(start, start + ask.size),
		total: all.length,
		page: Math.floor(start / ask.size) + 1,
	};
}
