import type { Query } from "../types";

/** The `Query` of a collection applied to rows already read: equality on fields, a half-open numeric range. Same as memory. */
export function matches<R>(row: R, query: Query<R> | undefined): boolean {
	if (query === undefined) return true;
	if (
		query.eq !== undefined &&
		!Object.entries(query.eq).every(
			([k, v]) => v === undefined || Object.getOwnPropertyDescriptor(row, k)?.value === v,
		)
	)
		return false;
	if (query.range !== undefined) {
		const value = Object.getOwnPropertyDescriptor(row, query.range.field)?.value;
		if (typeof value !== "number") return false;
		if (query.range.gte !== undefined && value < query.range.gte) return false;
		if (query.range.lt !== undefined && value >= query.range.lt) return false;
	}
	return true;
}
