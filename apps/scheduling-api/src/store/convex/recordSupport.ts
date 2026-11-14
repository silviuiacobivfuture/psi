import { z } from "zod";
import { type Query, StoreRefused } from "../types";

/** A wrapper said `not_found`: for a lookup that is "nothing there", for a write "no such row" (false). */
export function isNotFound(error: unknown): boolean {
	return error instanceof StoreRefused && error.reason === "not_found";
}

/** Whether a row satisfies a collection query (equality on fields, a half-open numeric range). */
export function matches<R>(row: R, query: Query<R> | undefined): boolean {
	if (query === undefined) return true;
	if (query.eq !== undefined)
		for (const [k, v] of Object.entries(query.eq))
			if (v !== undefined && Object.getOwnPropertyDescriptor(row, k)?.value !== v) return false;
	if (
		query.absent !== undefined &&
		Object.getOwnPropertyDescriptor(row, query.absent)?.value !== undefined
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

const JsonObject = z.record(z.string(), z.unknown());

/** The JSON text Convex keeps for a definition body, as the API's object. A body that is not an object is `{}`. */
export function parseBody(text: string): Record<string, unknown> {
	try {
		const parsed = JsonObject.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data : {};
	} catch {
		return {};
	}
}
