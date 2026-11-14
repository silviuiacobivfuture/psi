import type { VisitorAssistantPort, VisitorStoreRead, VisitorUsageRecord } from "@psi/engine";
import type { VisitorAssistantStore } from "@psi/scheduling";

/**
 * How long one read of the organisation's settings and meters is kept before the store is asked again. A turn's own
 * use empties it, so the next turn of this instance sees the meters it just moved; another instance's turns show up
 * within it.
 */
export const VISITOR_CONFIG_TTL_MS = 10_000;

/**
 * The engine's port to the organisation's visitor assistant settings and meters, over `@psi/scheduling`'s store
 * client (the server key's own reads and writes). The documents are handed on as stored; the engine parses and merges
 * them with the contract's own merge.
 */
export function visitorAssistantPort(
	store: VisitorAssistantStore,
	ttlMs: number = VISITOR_CONFIG_TTL_MS,
	now: () => number = Date.now,
): VisitorAssistantPort {
	const held = new Map<string, { at: number; read: VisitorStoreRead | undefined }>();
	return {
		async read(tenant) {
			const hit = held.get(tenant);
			if (hit !== undefined && now() - hit.at < ttlMs) return hit.read;
			const found = await store.config(tenant);
			const read: VisitorStoreRead | undefined =
				found === undefined
					? undefined
					: {
							...(found.platform === undefined ? {} : { platform: found.platform.body }),
							...(found.org === undefined ? {} : { org: found.org.body }),
							usage: found.usage,
						};
			held.set(tenant, { at: now(), read });
			return read;
		},
		async record(tenant, usage: VisitorUsageRecord) {
			held.delete(tenant);
			const done = await store.record(tenant, usage);
			if (done !== "ok") throw new Error(`the meters refused the turn: ${done}`);
		},
	};
}
