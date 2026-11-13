import type { StorePort } from "../types";

/**
 * What a contract section needs from an adapter: a store, and a fresh app in it (an app is a closed world, so every
 * section works in its own and never sees another's rows).
 */
export interface ContractEnv {
	readonly adapter: "memory" | "convex";
	readonly store: StorePort;
	/** A new, empty app (id valid as an `AppId`), with whatever the adapter needs for it to exist. */
	newApp(): Promise<string>;
	/** Removes what the sections created (a no-op in memory). */
	cleanup(): Promise<void>;
}

/** A section of the contract suite: registers `describe`/`it` blocks that run once per adapter. */
export type ContractSection = (env: () => ContractEnv) => void;
