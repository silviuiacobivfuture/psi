import { MemoryCollection } from "./memory-collection";
import { applyVisitRules } from "./memory-rules";
import { applyTeamRules } from "./memory-team";
import { createMemoryVisitor } from "./memory-visitor";
import { COLLECTIONS, type CollectionName, type Rows, type StorePort } from "./types";

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
	applyVisitRules(c);
	applyTeamRules(c);
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
