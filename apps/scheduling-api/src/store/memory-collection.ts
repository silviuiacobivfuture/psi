import { type Collection, type Query, StoreConflict } from "./types";

export class MemoryCollection<R extends { id: string; app: string }> implements Collection<R> {
	readonly #rows = new Map<string, R>();
	readonly #key = (app: string, id: string): string => `${app}\u0000${id}`;

	get(app: string, id: string): Promise<R | undefined> {
		const row = this.#rows.get(this.#key(app, id));
		return Promise.resolve(row === undefined ? undefined : structuredClone(row));
	}

	list(app: string, query?: Query<R>): Promise<R[]> {
		const out: R[] = [];
		for (const row of this.#rows.values()) {
			if (row.app !== app) continue;
			if (
				query?.eq !== undefined &&
				!Object.entries(query.eq).every(
					([k, v]) => v === undefined || Object.getOwnPropertyDescriptor(row, k)?.value === v,
				)
			)
				continue;
			if (query?.range !== undefined) {
				const value = Object.getOwnPropertyDescriptor(row, query.range.field)?.value;
				if (typeof value !== "number") continue;
				if (query.range.gte !== undefined && value < query.range.gte) continue;
				if (query.range.lt !== undefined && value >= query.range.lt) continue;
			}
			out.push(structuredClone(row));
		}
		return Promise.resolve(out);
	}

	insert(row: R): Promise<R> {
		const key = this.#key(row.app, row.id);
		if (this.#rows.has(key)) return Promise.reject(new StoreConflict(`${row.id} exists`));
		this.#rows.set(key, structuredClone(row));
		return Promise.resolve(structuredClone(row));
	}

	replace(row: R): Promise<boolean> {
		const key = this.#key(row.app, row.id);
		if (!this.#rows.has(key)) return Promise.resolve(false);
		this.#rows.set(key, structuredClone(row));
		return Promise.resolve(true);
	}

	remove(app: string, id: string): Promise<boolean> {
		return Promise.resolve(this.#rows.delete(this.#key(app, id)));
	}

	all(): R[] {
		return [...this.#rows.values()];
	}
}
