/** One read, asked once while nothing is written: every part of a page that needs it shares the one answer. */
export interface Memo<V> {
	get(key: string, ask: () => Promise<V>): Promise<V>;
}

/**
 * What one port (one request) remembers of what it read. A write through the port forgets all of it, so a page never
 * shows what it has just changed as it was before. Nothing is kept from one request to the next.
 */
export interface PortMemory {
	memo<V>(): Memo<V>;
	/** The port wrote (or tried to): everything it remembers is asked again. */
	wrote(): void;
}

export function createPortMemory(): PortMemory {
	const clears: (() => void)[] = [];
	return {
		memo<V>(): Memo<V> {
			const held = new Map<string, Promise<V>>();
			clears.push(() => held.clear());
			return {
				get(key, ask) {
					const found = held.get(key);
					if (found !== undefined) return found;
					const asked = ask();
					held.set(key, asked);
					// A failed ask is asked again next time, never remembered.
					asked.catch(() => {
						if (held.get(key) === asked) held.delete(key);
					});
					return asked;
				},
			};
		},
		wrote() {
			for (const clear of clears) clear();
		},
	};
}
