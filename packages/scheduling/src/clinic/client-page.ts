/**
 * One numbered page of the client list: the ordering, the search and the bounds every store applies the same way (the
 * Convex query over its index range, the service's in-memory store, the console's in-memory clinic). The candidates
 * are what the store read from its indexes (one standing of one clinic, or the ids a filter or a reach named); this
 * module never reads anything itself.
 */

/** How the list may be ordered: `-` first is descending. `last` is the client's latest past visit. */
export const CLIENT_SORTS = ["name", "-name", "last", "-last", "created", "-created"] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

/** The page sizes a person may pick. */
export const CLIENT_PAGE_SIZES = [25, 50, 100] as const;
/** The most rows one numbered page carries (the API's `MAX_PAGE`). */
export const MAX_CLIENT_PAGE = 500;

/** What a page orders: a client's id, name, creation and latest past visit (null: never came). */
export interface PageCandidate {
	readonly id: string;
	readonly name: string;
	readonly createdAt: number;
	readonly lastVisit: number | null;
}

/** Text folded for search and order: lower case, without diacritics (Ș → s, Ă → a), spaces collapsed. */
export function fold(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}+/gu, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

/** Whether a name matches a search: every word of the query appears in the folded name (empty query: all). */
export function nameMatches(name: string, query: string): boolean {
	const words = fold(query)
		.split(" ")
		.filter((w) => w !== "");
	if (words.length === 0) return true;
	const folded = fold(name);
	return words.every((w) => folded.includes(w));
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The comparator of a sort; ties fall back to the folded name, then the id, so every page boundary is stable. */
export function comparator(sort: ClientSort): (a: PageCandidate, b: PageCandidate) => number {
	const name = (a: PageCandidate, b: PageCandidate): number =>
		byText(fold(a.name), fold(b.name)) || byText(a.name, b.name) || byText(a.id, b.id);
	switch (sort) {
		case "name":
			return name;
		case "-name":
			return (a, b) => -name(a, b);
		case "created":
			return (a, b) => a.createdAt - b.createdAt || name(a, b);
		case "-created":
			return (a, b) => b.createdAt - a.createdAt || name(a, b);
		// Never came: last in either direction (a list sorted by visit is about who came).
		case "last":
			return (a, b) =>
				(a.lastVisit ?? Number.POSITIVE_INFINITY) - (b.lastVisit ?? Number.POSITIVE_INFINITY) ||
				name(a, b);
		case "-last":
			return (a, b) =>
				(b.lastVisit ?? Number.NEGATIVE_INFINITY) - (a.lastVisit ?? Number.NEGATIVE_INFINITY) ||
				name(a, b);
		default: {
			const never: never = sort;
			throw new Error(`unknown sort ${String(never)}`);
		}
	}
}

/** Whether ordering by this sort needs each candidate's latest visit (the one costly read, done only then). */
export const needsLastVisit = (sort: ClientSort): boolean => sort === "last" || sort === "-last";

/**
 * Where a page starts: `offset` as asked, moved back to the last page's start when it lies past the end (a shared link
 * to page 9 of a list that shrank shows its last page, not an empty one), and to a multiple of `size`.
 */
export function pageStart(offset: number, size: number, total: number): number {
	const start = Math.max(0, Math.floor(offset / size) * size);
	if (total === 0) return 0;
	return start >= total ? Math.floor((total - 1) / size) * size : start;
}

/** The candidates ordered, the page cut out, and how many there are in all. */
export function orderPage<T extends PageCandidate>(
	candidates: ReadonlyArray<T>,
	sort: ClientSort,
	offset: number,
	size: number,
): { rows: T[]; total: number; offset: number } {
	const sorted = [...candidates].sort(comparator(sort));
	const start = pageStart(offset, size, sorted.length);
	return {
		rows: sorted.slice(start, start + size),
		total: sorted.length,
		offset: start,
	};
}
