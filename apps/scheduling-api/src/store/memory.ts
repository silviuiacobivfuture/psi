import { createMemoryVisitor } from "./memory-visitor";
import {
	COLLECTIONS,
	type Collection,
	type CollectionName,
	type Query,
	type Rows,
	StoreConflict,
	type StorePort,
} from "./types";

class MemoryCollection<R extends { id: string; app: string }> implements Collection<R> {
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

export interface MemoryStore extends StorePort {
	/** Everything held, for tests that assert that a refusal wrote nothing. */
	dump(): string;
}

type Changes = {
	seq: number;
	at: number;
	kind: "appointment" | "client" | "roster" | "request" | "ready";
	op: "created" | "updated" | "deleted" | "ready";
	id: string;
};

export function createMemoryStore(clock: () => number = Date.now): MemoryStore {
	const c = Object.fromEntries(COLLECTIONS.map((name) => [name, new MemoryCollection()])) as {
		[K in CollectionName]: MemoryCollection<Rows[K]>;
	};
	const events = new Map<string, Changes[]>();
	const listeners = new Map<string, Set<(events: Changes[]) => void>>();
	const changes: StorePort["changes"] = {
		append(app, event) {
			const log = events.get(app) ?? [];
			const entry: Changes = { seq: (log.at(-1)?.seq ?? 0) + 1, at: clock(), ...event };
			log.push(entry);
			events.set(app, log);
			for (const listener of listeners.get(app) ?? []) listener([entry]);
			return Promise.resolve();
		},
		subscribe(app, after, onEvents) {
			const set = listeners.get(app) ?? new Set();
			const listener = (batch: Changes[]): void => {
				const fresh = batch.filter((e) => e.seq > after);
				if (fresh.length > 0) onEvents(fresh);
			};
			set.add(listener);
			listeners.set(app, set);
			return Promise.resolve(() => set.delete(listener) && undefined);
		},
		since: (app, seq) => Promise.resolve((events.get(app) ?? []).filter((e) => e.seq > seq)),
		head: (app) => Promise.resolve(events.get(app)?.at(-1)?.seq ?? 0),
	};
	const { visitor, requests, state } = createMemoryVisitor(c, clock);
	return {
		c,
		changes,
		appsOf: (subject) =>
			Promise.resolve(
				c.members
					.all()
					.filter((m) => m.subject === subject)
					.map((m) => ({ app: m.app, roles: m.roles })),
			),
		visitor,
		requests,
		ping: () => Promise.resolve(),
		dump: () =>
			JSON.stringify([COLLECTIONS.map((name) => c[name].all()), [...events.entries()], state()]),
	};
}
