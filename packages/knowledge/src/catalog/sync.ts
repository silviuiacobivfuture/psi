import type { Brand } from "../contract";
import type { StoredEntry } from "../store/stored";
import type { Catalog } from "./catalog";

/** Where the mirrored entries come from: a knowledge store (`kb.stored`). */
export interface StoredSource {
	stored(brand: Brand): Promise<ReadonlyArray<StoredEntry>>;
}

export interface CatalogSyncOptions {
	source: StoredSource;
	catalog: Catalog;
	/** Code-held ids (the seed, the demo): never dropped, never replaced by a stored twin. */
	keep: (id: string) => boolean;
	/** How long one brand's mirror counts as fresh. */
	ttlMs?: number;
	/** How long a search waits for a refresh before it goes on with the last good mirror. */
	deadlineMs?: number;
	now?: () => number;
	/** A refresh failed (the store is unreachable): the last good mirror is kept. Never the query. */
	onError?: (brand: Brand, error: unknown) => void;
}

export interface CatalogSync {
	/** Refreshes the brand's mirror when it is stale; resolves by the deadline at the latest. */
	fresh(brand: Brand): Promise<void>;
	/** Refreshes now, whatever the age (tests; the first load). */
	refresh(brand: Brand): Promise<void>;
}

/**
 * Keeps a process's catalog (the lexical tier and the agent's catalog tools) in step with the
 * vector store, whichever process wrote to it: the CMS indexes a source or unpublishes an entry,
 * and every site's catalog follows within `ttlMs`. Refreshes are single-flight per brand and run in
 * the background once a mirror exists (only the first search waits, at most `deadlineMs`); a
 * failed one keeps the last good mirror.
 */
export function createCatalogSync(opts: CatalogSyncOptions): CatalogSync {
	const ttl = opts.ttlMs ?? 15_000;
	const deadline = opts.deadlineMs ?? 1_500;
	const now = opts.now ?? Date.now;
	const fetchedAt = new Map<Brand, number>();
	const inflight = new Map<Brand, Promise<void>>();

	const refresh = (brand: Brand): Promise<void> => {
		const running = inflight.get(brand);
		if (running !== undefined) return running;
		const work = opts.source
			.stored(brand)
			.then((stored) => {
				opts.catalog.mirror(brand, stored, opts.keep);
				fetchedAt.set(brand, now());
			})
			.catch((error: unknown) => {
				// Try again after a TTL, not on every search.
				fetchedAt.set(brand, now());
				try {
					opts.onError?.(brand, error);
				} catch {
					// A failing log hook must not change the answer.
				}
			})
			.finally(() => inflight.delete(brand));
		inflight.set(brand, work);
		return work;
	};

	return {
		refresh,
		async fresh(brand) {
			const at = fetchedAt.get(brand);
			if (at !== undefined && now() - at < ttl) return;
			// A mirror is already there: refresh it in the background and search the one we have, so
			// a stale catalog never holds a visitor's turn. Only the very first search waits.
			if (at !== undefined) {
				void refresh(brand);
				return;
			}
			let timer: ReturnType<typeof setTimeout> | undefined;
			const late = new Promise<void>((resolve) => {
				timer = setTimeout(resolve, deadline);
			});
			await Promise.race([refresh(brand), late]);
			clearTimeout(timer);
		},
	};
}
