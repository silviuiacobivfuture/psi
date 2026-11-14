/** What a member holds in an app: per catalogue key, the scopes (the whole catalogue asked of OpenFGA). */
export type HeldScopes = Map<string, ("all" | "assigned" | "own")[]>;

/**
 * A member's held scopes, kept between requests while what they are derived from is unchanged. The whole catalogue is
 * ~480 OpenFGA checks (ten BatchChecks): every console page asked it. The answer depends only on the tuples of the
 * member (their roles, grants, coordinators), of the app's roles (their permissions and inclusions), the platform
 * administrator's standing, and the member's denials — all written from rows of the store. The caller names those rows
 * in `fingerprint`: a change to any of them is a different fingerprint, and the catalogue is asked again at once.
 * Tuples written behind the store's back (the reconcile tool) are seen within `ttlMs`.
 */
export interface HeldKept {
	get(
		id: string,
		ask: () => Promise<HeldScopes>,
		/** The rows the answer derives from, digested; and whether the answer may be kept at all. */
		basis: { fingerprint: string; keep: boolean; now: number },
	): Promise<HeldScopes>;
}

export interface HeldKeptOptions {
	ttlMs: number;
	/** At most this many members' answers; the oldest goes first. */
	max: number;
}

/**
 * A minute: the longest a tuple written outside the service (the reconcile tool, a hand repair) waits to show. A change
 * made through the service shows at once (its rows change the fingerprint).
 */
export const HELD_KEPT: HeldKeptOptions = { ttlMs: 60_000, max: 2_000 };

/**
 * A row changed this recently may still have its tuples on the way (the service writes the row, then the tuples): an
 * answer asked meanwhile could pair the new rows with the old tuples, so it is not kept.
 */
export const SETTLE_MS = 10_000;

interface Entry {
	fingerprint: string;
	at: number;
	answer: Promise<HeldScopes>;
}

export function createHeldKept(options: HeldKeptOptions): HeldKept {
	const held = new Map<string, Entry>();
	return {
		get(id, ask, basis) {
			const found = held.get(id);
			if (
				found !== undefined &&
				found.fingerprint === basis.fingerprint &&
				basis.now - found.at <= options.ttlMs &&
				basis.now >= found.at
			)
				return found.answer.then((m) => new Map(m));
			const answer = ask();
			if (!basis.keep) {
				held.delete(id);
				return answer;
			}
			const entry: Entry = { fingerprint: basis.fingerprint, at: basis.now, answer };
			held.delete(id);
			held.set(id, entry);
			while (held.size > options.max) {
				const oldest = held.keys().next().value;
				if (oldest === undefined) break;
				held.delete(oldest);
			}
			// A failed ask is not an answer: forgotten, asked again next time.
			answer.catch(() => {
				if (held.get(id) === entry) held.delete(id);
			});
			return answer.then((m) => new Map(m));
		},
	};
}
