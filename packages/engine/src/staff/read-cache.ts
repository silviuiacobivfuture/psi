import { createHash } from "node:crypto";

/**
 * What one person read through the assistant a moment ago, kept for a few seconds so the same question in the same
 * conversation does not ask the service again. Keyed by the person, the app and a digest of exactly what they hold
 * (a role change or "view as" is another key), so nothing is ever shared across people or organisations; any change
 * the person makes through the assistant forgets all of theirs at once.
 */
export interface ReadCache {
	get(scope: string, key: string): unknown;
	put(scope: string, key: string, value: unknown, ttlMs: number): void;
	/** Forgets everything one person read in one app (every capability digest). */
	forget(person: string): void;
}

/** `sub|app|digest-of-capabilities`; the first two parts are what `forget` takes. */
export function readScope(sub: string, app: string, caps: Iterable<string> | undefined): string {
	const held = caps === undefined ? "unknown" : [...caps].sort().join(",");
	const digest = createHash("sha256").update(held).digest("hex").slice(0, 16);
	return `${personOf(sub, app)}|${digest}`;
}

export const personOf = (sub: string, app: string): string => `${sub}|${app}`;

const NOTHING = Symbol("nothing");

interface Entry {
	at: number;
	ttl: number;
	value: unknown;
}

export function createReadCache(
	now: () => number = Date.now,
	limits: { scopes: number; perScope: number } = { scopes: 2_000, perScope: 200 },
): ReadCache {
	const scopes = new Map<string, Map<string, Entry>>();
	return {
		get(scope, key) {
			const entry = scopes.get(scope)?.get(key);
			if (entry === undefined) return NOTHING;
			if (now() - entry.at >= entry.ttl) {
				scopes.get(scope)?.delete(key);
				return NOTHING;
			}
			return entry.value;
		},
		put(scope, key, value, ttlMs) {
			if (ttlMs <= 0) return;
			let held = scopes.get(scope);
			if (held === undefined) {
				if (scopes.size >= limits.scopes) scopes.delete(scopes.keys().next().value ?? "");
				held = new Map();
				scopes.set(scope, held);
			}
			if (held.size >= limits.perScope) held.delete(held.keys().next().value ?? "");
			held.set(key, { at: now(), ttl: ttlMs, value });
		},
		forget(person) {
			for (const scope of [...scopes.keys()])
				if (scope.startsWith(`${person}|`)) scopes.delete(scope);
		},
	};
}

/** Whether `get` found nothing (a cached `undefined` or `null` is still an answer). */
export function missed(value: unknown): boolean {
	return value === NOTHING;
}
