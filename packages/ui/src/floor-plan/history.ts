/** Undo and redo for any immutable value: a bounded past, the present, the future. */
export interface History<T> {
	readonly past: ReadonlyArray<T>;
	readonly present: T;
	readonly future: ReadonlyArray<T>;
	/** The last pushed coalescing key: repeated pushes with the same key replace the present instead of stacking. */
	readonly key: string | undefined;
}

export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
	return { past: [], present, future: [], key: undefined };
}

/** Records `next` as the new present. The same value (by reference) records nothing; a new edit clears the redo stack. */
export function push<T>(h: History<T>, next: T, key?: string): History<T> {
	if (next === h.present) return h;
	if (key !== undefined && key === h.key) return { ...h, present: next, future: [] };
	const past = [...h.past, h.present];
	return {
		past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
		present: next,
		future: [],
		key,
	};
}

export function canUndo<T>(h: History<T>): boolean {
	return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
	return h.future.length > 0;
}

export function undo<T>(h: History<T>): History<T> {
	const previous = h.past[h.past.length - 1];
	if (previous === undefined) return h;
	return {
		past: h.past.slice(0, -1),
		present: previous,
		future: [h.present, ...h.future],
		key: undefined,
	};
}

export function redo<T>(h: History<T>): History<T> {
	const [next, ...rest] = h.future;
	if (next === undefined) return h;
	return { past: [...h.past, h.present], present: next, future: rest, key: undefined };
}
