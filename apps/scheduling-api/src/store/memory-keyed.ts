import {
	KEYED_KEY,
	KEYED_MAX_BODY,
	type KeyedEntry,
	type KeyedNamespace,
	type KeyedPort,
} from "./ports";
import { type Rows, StoreRefused } from "./types";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface Apps {
	get(app: string, id: string): Promise<Rows["apps"] | undefined>;
}

/** The in-memory engagement store: the same bounds and refusals the Convex wrapper has. */
export function createMemoryKeyed(
	apps: Apps,
	clock: () => number,
): { port: KeyedPort; state: () => unknown } {
	const rows = new Map<string, KeyedEntry>();
	const slot = (app: string, ns: KeyedNamespace, key: string): string =>
		`${app}\u0000${ns}\u0000${key}`;
	const port: KeyedPort = {
		get: (app, ns, key) => Promise.resolve(rows.get(slot(app, ns, key))),
		async put(app, ns, key, expected, body) {
			if ((await apps.get(app, app)) === undefined) throw new StoreRefused("not_found");
			if (
				!KEYED_KEY.test(key) ||
				body.length > KEYED_MAX_BODY ||
				!Number.isInteger(expected) ||
				expected < 0
			)
				throw new StoreRefused("invalid");
			const held = rows.get(slot(app, ns, key));
			if ((held?.revision ?? 0) !== expected) throw new StoreRefused("stale");
			const saved: KeyedEntry = { key, body, revision: expected + 1, updatedAt: clock() };
			rows.set(slot(app, ns, key), saved);
			return { revision: saved.revision, updatedAt: saved.updatedAt };
		},
		list(app, ns, options) {
			const prefix = options?.prefix ?? "";
			const limit = Math.max(1, Math.min(MAX_LIMIT, options?.limit ?? DEFAULT_LIMIT));
			const head = `${app}\u0000${ns}\u0000`;
			return Promise.resolve(
				[...rows.entries()]
					.filter(([id, row]) => id.startsWith(head) && row.key.startsWith(prefix))
					.map(([, row]) => row)
					.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
					.slice(0, limit),
			);
		},
		remove: (app, ns, key) => Promise.resolve(rows.delete(slot(app, ns, key))),
	};
	return { port, state: () => [...rows.entries()] };
}
