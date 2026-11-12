/** What a caller asks for, in SEB's SDK vocabulary. */
export type Consistency = "minimize-latency" | "higher-consistency";

/** How long `afterWrite()` escalates by default (SEB SDK `DEFAULT_AFTER_WRITE_MS`). */
export const DEFAULT_AFTER_WRITE_MS = 5_000;

/**
 * MINIMIZE_LATENCY by default; HIGHER_CONSISTENCY for a window after this caller's own write, so a grant followed
 * by a check is never answered from a cache older than the grant. Per process, never shortened by a later call.
 */
export class ConsistencyPolicy {
	readonly #now: () => number;
	#escalatedUntil = 0;

	constructor(now: () => number = Date.now) {
		this.#now = now;
	}

	afterWrite(ms: number = DEFAULT_AFTER_WRITE_MS): void {
		const until = this.#now() + ms;
		if (until > this.#escalatedUntil) this.#escalatedUntil = until;
	}

	/** The stronger of what the caller asked for and what the window demands. */
	resolve(requested?: Consistency): Consistency {
		if (requested === "higher-consistency") return requested;
		return this.#now() < this.#escalatedUntil
			? "higher-consistency"
			: (requested ?? "minimize-latency");
	}
}

export function toWire(value: Consistency): "MINIMIZE_LATENCY" | "HIGHER_CONSISTENCY" {
	return value === "higher-consistency" ? "HIGHER_CONSISTENCY" : "MINIMIZE_LATENCY";
}
