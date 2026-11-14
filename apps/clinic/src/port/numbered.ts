import { pageStart } from "@psi/scheduling/clinic";

/** Where a numbered page of a list is: the page (1-based) and how many rows a page holds. */
export interface PageAt {
	readonly page: number;
	readonly size: number;
}

/** One numbered page: its rows, how many there are in all, and the page really shown (past the end: the last). */
export interface Numbered<T> {
	items: ReadonlyArray<T>;
	total: number;
	page: number;
}

/** The offset a page starts at, as the service is asked it. */
export const offsetAt = (at: PageAt): number => (at.page - 1) * at.size;

/** The page an answer's offset is, at `size` a page. */
export const pageOfOffset = (offset: number, size: number): number => Math.floor(offset / size) + 1;

/**
 * One numbered page of a list held whole: the in-memory clinic's lists, or a list bounded by its own nature (one day's
 * reminders). The same clamping as the service: a page past the end is the last one.
 */
export function numberedOf<T>(all: ReadonlyArray<T>, at: PageAt): Numbered<T> {
	const start = pageStart(offsetAt(at), at.size, all.length);
	return {
		items: all.slice(start, start + at.size),
		total: all.length,
		page: pageOfOffset(start, at.size),
	};
}
