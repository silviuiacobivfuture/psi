/**
 * The bounds a list-shaped query reads within. Convex stops one transaction at 16,384 documents read, so a list that
 * could grow past that is read with `take(max + 1)`: one row more than the bound says the list is too long, and the
 * query refuses (`too_many_rows`) rather than answer from part of the data, as the reports do.
 */

/** A list of the app's activity (visits, bookings, payments, a range of the roster…). */
export const LIST_MAX = 12_000;
/** A catalogue of the app (practitioners, rooms, services, roles, definitions…): far fewer in any real clinic. */
export const CATALOG_MAX = 2_000;
/** What one client has (packages, payments, records, files…). */
export const PER_CLIENT_MAX = 5_000;

export const TOO_MANY_ROWS = "too_many_rows" as const;

/** The rows a query's `take` answers, or `undefined` when there are more than `max` of them. */
export async function within<T>(
	query: { take(n: number): Promise<T[]> },
	max: number,
): Promise<T[] | undefined> {
	const rows = await query.take(max + 1);
	return rows.length > max ? undefined : rows;
}
