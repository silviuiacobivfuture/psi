import { type Collection, type Query, StoreConflict } from "./types";

type Sorted<R> = { rows: R[]; values: number[] };

/** The value of a numeric field, or `undefined`: what a range and an order compare. */
const numberOf = (row: object, field: string): number | undefined => {
	const v: unknown = Reflect.get(row, field);
	return typeof v === "number" ? v : undefined;
};

/** The first index whose value is `>= target` (`strict`: `> target`). */
function lowerBound(values: readonly number[], target: number, strict: boolean): number {
	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		const v = values[mid] ?? 0;
		if (strict ? v <= target : v < target) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * The in-memory adapter's table: rows by app, and, built on the first read that ranges or orders on a numeric field, an
 * index of the app's rows sorted by that field (dropped on any write to the app). A calendar week reads the week, and a
 * journal page reads its page, out of 56 000 rows, the way an indexed store would; only the rows answered are copied.
 * Rows of one value keep the order they were written in (a stable sort, as an index keeps them): read backwards, the
 * newest first.
 */
export class MemoryCollection<R extends { id: string; app: string }> implements Collection<R> {
	readonly #apps = new Map<string, Map<string, R>>();
	readonly #sorted = new Map<string, Sorted<R>>();
	readonly #equals = new Map<string, Map<string, R[]>>();
	readonly #groups = new Map<string, Map<string, Sorted<R>>>();

	#table(app: string): Map<string, R> {
		const held = this.#apps.get(app);
		if (held !== undefined) return held;
		const fresh = new Map<string, R>();
		this.#apps.set(app, fresh);
		return fresh;
	}

	#changed(app: string): void {
		for (const key of this.#sorted.keys())
			if (key.startsWith(`${app}\u0000`)) this.#sorted.delete(key);
		for (const key of this.#equals.keys())
			if (key.startsWith(`${app}\u0000`)) this.#equals.delete(key);
		for (const key of this.#groups.keys())
			if (key.startsWith(`${app}\u0000`)) this.#groups.delete(key);
	}

	/** The app's rows by the value of `field`, in the order they were written (built on first use, dropped on a write). */
	#equal(app: string, field: string): Map<string, R[]> {
		const key = `${app}\u0000${field}`;
		const held = this.#equals.get(key);
		if (held !== undefined) return held;
		const built = new Map<string, R[]>();
		for (const row of this.#table(app).values()) {
			const k = valueKey(Reflect.get(row, field));
			const list = built.get(k);
			if (list === undefined) built.set(k, [row]);
			else list.push(row);
		}
		this.#equals.set(key, built);
		return built;
	}

	#index(app: string, field: string): Sorted<R> {
		const key = `${app}\u0000${field}`;
		const held = this.#sorted.get(key);
		if (held !== undefined) return held;
		const rows = [...this.#table(app).values()]
			.filter((r) => numberOf(r, field) !== undefined)
			.sort((a, b) => (numberOf(a, field) ?? 0) - (numberOf(b, field) ?? 0));
		const built = { rows, values: rows.map((r) => numberOf(r, field) ?? 0) };
		this.#sorted.set(key, built);
		return built;
	}

	get(app: string, id: string): Promise<R | undefined> {
		const row = this.#apps.get(app)?.get(id);
		return Promise.resolve(row === undefined ? undefined : copyOf(row));
	}

	/** The rows found of `ids`, each once, in the order asked. */
	getMany(app: string, ids: readonly string[]): Promise<R[]> {
		const table = this.#apps.get(app);
		const found: R[] = [];
		for (const id of new Set(ids)) {
			const row = table?.get(id);
			if (row !== undefined) found.push(copyOf(row));
		}
		return Promise.resolve(found);
	}

	/** The app's rows of each value of `field`, each sorted by `by` (built on first use, dropped on a write). */
	#grouped(app: string, field: string, by: string): Map<string, Sorted<R>> {
		const key = `${app}\u0000${field}\u0000${by}`;
		const held = this.#groups.get(key);
		if (held !== undefined) return held;
		const built = new Map<string, Sorted<R>>();
		for (const [value, rows] of this.#equal(app, field)) {
			const sorted = rows
				.filter((r) => numberOf(r, by) !== undefined)
				.sort((a, b) => (numberOf(a, by) ?? 0) - (numberOf(b, by) ?? 0));
			built.set(value, { rows: sorted, values: sorted.map((r) => numberOf(r, by) ?? 0) });
		}
		this.#groups.set(key, built);
		return built;
	}

	/** The rows of a few values of one field within a range, value by value, as an index per column reads them. */
	#oneOf(app: string, query: Query<R>, keep: (row: R) => boolean): R[] | undefined {
		const oneOf = query.oneOf;
		const range = query.range;
		if (oneOf === undefined || range === undefined || query.order !== undefined) return undefined;
		const groups = this.#grouped(app, oneOf.field, range.field);
		const out: R[] = [];
		for (const value of new Set(oneOf.values)) {
			const held = groups.get(valueKey(value));
			if (held === undefined) continue;
			const from = range.gte === undefined ? 0 : lowerBound(held.values, range.gte, false);
			const to =
				range.lt === undefined ? held.rows.length : lowerBound(held.values, range.lt, false);
			for (let i = from; i < to; i++) {
				const row = held.rows[i];
				if (row !== undefined && keep(row)) out.push(copyOf(row));
			}
		}
		return out;
	}

	list(app: string, query?: Query<R>): Promise<R[]> {
		const eq = Object.entries(query?.eq ?? {}).filter(([, v]) => v !== undefined);
		const keep = (row: R): boolean => eq.every(([k, v]) => Reflect.get(row, k) === v);
		const few = query === undefined ? undefined : this.#oneOf(app, query, keep);
		if (few !== undefined) return Promise.resolve(few);
		const range = query?.range;
		const order = query?.order;
		const field = range?.field ?? order?.field;
		const first = eq[0];
		// Equality without an order: the rows of that value only (a client's notes, a package's payments).
		if (first !== undefined && order === undefined) {
			const out: R[] = [];
			for (const row of this.#equal(app, first[0]).get(valueKey(first[1])) ?? []) {
				if (!keep(row)) continue;
				if (range !== undefined && !inRange(numberOf(row, range.field), range)) continue;
				out.push(copyOf(row));
			}
			return Promise.resolve(out);
		}
		if (
			field === undefined ||
			(range !== undefined && order !== undefined && order.field !== range.field)
		) {
			const out: R[] = [];
			for (const row of this.#apps.get(app)?.values() ?? []) {
				if (!keep(row)) continue;
				if (range !== undefined && !inRange(numberOf(row, range.field), range)) continue;
				out.push(copyOf(row));
			}
			return Promise.resolve(out);
		}
		const { rows, values } = this.#index(app, field);
		const from = range?.gte === undefined ? 0 : lowerBound(values, range.gte, false);
		const to = range?.lt === undefined ? rows.length : lowerBound(values, range.lt, false);
		const limit = order?.limit ?? Number.POSITIVE_INFINITY;
		const out: R[] = [];
		if (order?.dir === "desc") {
			for (let i = to - 1; i >= from && out.length < limit; i--) {
				const row = rows[i];
				if (row !== undefined && keep(row)) out.push(copyOf(row));
			}
		} else {
			for (let i = from; i < to && out.length < limit; i++) {
				const row = rows[i];
				if (row !== undefined && keep(row)) out.push(copyOf(row));
			}
		}
		return Promise.resolve(out);
	}

	insert(row: R): Promise<R> {
		const table = this.#table(row.app);
		if (table.has(row.id)) return Promise.reject(new StoreConflict(`${row.id} exists`));
		table.set(row.id, copyOf(row));
		this.#changed(row.app);
		return Promise.resolve(copyOf(row));
	}

	replace(row: R): Promise<boolean> {
		const table = this.#apps.get(row.app);
		if (table === undefined || !table.has(row.id)) return Promise.resolve(false);
		table.set(row.id, copyOf(row));
		this.#changed(row.app);
		return Promise.resolve(true);
	}

	remove(app: string, id: string): Promise<boolean> {
		const gone = this.#apps.get(app)?.delete(id) ?? false;
		if (gone) this.#changed(app);
		return Promise.resolve(gone);
	}

	all(): R[] {
		return [...this.#apps.values()].flatMap((table) => [...table.values()]);
	}
}

/**
 * A deep copy of a stored row, so a caller never holds the table's own object. Rows are plain data (objects, arrays,
 * strings, numbers, booleans): copied field by field, several times faster than `structuredClone`; anything else (a
 * typed array) is still cloned whole.
 */
function copyOf<T>(value: T): T {
	return copy(value) as T;
}
function copy(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(copy);
	if (v === null || typeof v !== "object") return v;
	if (Object.getPrototypeOf(v) !== Object.prototype) return structuredClone(v);
	const out: Record<string, unknown> = {};
	for (const [k, x] of Object.entries(v)) out[k] = copy(x);
	return out;
}

/** A field's value as a map key: its type and its text, so `1` and `"1"` stay apart. */
function valueKey(v: unknown): string {
	return `${typeof v}:${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
}

function inRange(value: number | undefined, range: { gte?: number; lt?: number }): boolean {
	if (value === undefined) return false;
	if (range.gte !== undefined && value < range.gte) return false;
	return range.lt === undefined || value < range.lt;
}
