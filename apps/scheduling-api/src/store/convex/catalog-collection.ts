import type { Collection, Query } from "../types";
import { matches } from "./filter";

/**
 * A `Collection` over a store that reads an app's rows whole and writes them by operation: `all` reads, `create`
 * returns the saved row (the store assigns the id), `update` is handed the row as it was and as it should be and makes
 * exactly the difference, `remove` says whether there was a row. Everything else is derived, so every collection of
 * this area answers `get`/`list`/`replace` the same way the in-memory adapter does.
 */
export interface CatalogSpec<R extends { id: string; app: string }> {
	all(app: string): Promise<R[]>;
	one?(app: string, id: string): Promise<R | undefined>;
	create(row: R): Promise<R>;
	update(before: R, after: R): Promise<void>;
	remove(app: string, id: string): Promise<boolean>;
}

export function catalogCollection<R extends { id: string; app: string }>(
	spec: CatalogSpec<R>,
): Collection<R> {
	const get = async (app: string, id: string): Promise<R | undefined> =>
		spec.one !== undefined ? spec.one(app, id) : (await spec.all(app)).find((row) => row.id === id);
	return {
		get,
		async list(app: string, query?: Query<R>) {
			return (await spec.all(app)).filter((row) => matches(row, query));
		},
		insert: (row) => spec.create(row),
		async replace(row) {
			const before = await get(row.app, row.id);
			if (before === undefined) return false;
			await spec.update(before, row);
			return true;
		},
		remove: (app, id) => spec.remove(app, id),
	};
}
