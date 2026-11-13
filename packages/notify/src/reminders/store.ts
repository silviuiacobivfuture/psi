/** Records which link ids were used. `claim` is atomic: exactly one caller ever gets `true` for an id. */
export interface UsedLinks {
	claim(id: string, expiresAt: number): Promise<boolean>;
	/** Gives an id back when the action it guarded failed, so the person can try the link again. */
	release(id: string): Promise<void>;
}

export function createMemoryUsedLinks(now: () => number = Date.now): UsedLinks {
	const used = new Map<string, number>();
	return {
		claim(id, expiresAt) {
			for (const [k, e] of used) if (e <= now()) used.delete(k);
			if (used.has(id)) return Promise.resolve(false);
			used.set(id, expiresAt);
			return Promise.resolve(true);
		},
		release(id) {
			used.delete(id);
			return Promise.resolve();
		},
	};
}
