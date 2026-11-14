import type { WrappedKey } from "@psi/scheduling/crypto";
import type { KeyStore } from "../ports/crypto";

/** The in-memory data keys (tests and the synthetic local run): wrapped by the master key, like the stored ones. */
export function memoryKeys(): KeyStore {
	const held = new Map<string, Map<number, WrappedKey>>();
	return {
		keys: (app) => Promise.resolve([...(held.get(app)?.values() ?? [])]),
		install(app, version, wrapped) {
			const versions = held.get(app) ?? new Map<number, WrappedKey>();
			if (!versions.has(version)) versions.set(version, wrapped);
			held.set(app, versions);
			return Promise.resolve();
		},
	};
}
