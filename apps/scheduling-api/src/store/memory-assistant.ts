import { currentActor } from "./actor";
import type { StoredDocument } from "./ports";
import {
	type AssistantUsagePort,
	addCounts,
	NO_USAGE,
	type PlatformDocumentsPort,
	type UsageCounts,
	usageKeyText,
} from "./ports-assistant";
import { StoreRefused } from "./types";

/** The store's own bound on one document (the Convex wrapper's `MAX_DOCUMENT_CHARS`). */
const MAX_DOCUMENT_CHARS = 512_000;

export interface MemoryAssistant {
	platform: PlatformDocumentsPort;
	usage: AssistantUsagePort;
	state(): unknown;
}

/** The estate's documents and the assistants' meters, in memory, with the Convex wrapper's refusals. */
export function createMemoryAssistant(
	clock: () => number,
	appExists: (app: string) => Promise<boolean>,
): MemoryAssistant {
	const docs = new Map<string, StoredDocument>();
	const meters = new Map<string, UsageCounts>();
	return {
		platform: {
			get: (kind) => Promise.resolve(docs.get(kind)),
			put(kind, expected, body) {
				if (!Number.isInteger(expected) || expected < 0 || body.length > MAX_DOCUMENT_CHARS)
					return Promise.reject(new StoreRefused("invalid"));
				const held = docs.get(kind);
				if ((held?.revision ?? 0) !== expected) return Promise.reject(new StoreRefused("stale"));
				const saved = {
					revision: expected + 1,
					body,
					updatedAt: clock(),
					updatedBy: currentActor(),
				};
				docs.set(kind, saved);
				return Promise.resolve({ revision: saved.revision, updatedAt: saved.updatedAt });
			},
		},
		usage: {
			async add(app, keys, delta) {
				if (!(await appExists(app))) throw new StoreRefused("not_found");
				if (Object.values(delta).some((n) => !Number.isInteger(n) || n < 0))
					throw new StoreRefused("invalid");
				for (const key of keys) {
					const id = `${app}|${usageKeyText(key)}`;
					meters.set(id, addCounts(meters.get(id) ?? NO_USAGE, delta));
				}
			},
			read: (app, keys) =>
				Promise.resolve(keys.map((k) => meters.get(`${app}|${usageKeyText(k)}`) ?? NO_USAGE)),
		},
		state: () => [[...docs.entries()], [...meters.entries()]],
	};
}
