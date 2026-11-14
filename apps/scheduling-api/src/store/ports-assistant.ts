import type { StoredDocument } from "./ports";

/** Documents the estate keeps for itself, not for one app: today the assistants' platform tier. */
export const PLATFORM_DOCUMENT_KINDS = ["assistant_platform"] as const;
export type PlatformDocumentKind = (typeof PLATFORM_DOCUMENT_KINDS)[number];

/** The estate's own documents, saved with the same optimistic concurrency as an app's. */
export interface PlatformDocumentsPort {
	get(kind: PlatformDocumentKind): Promise<StoredDocument | undefined>;
	/** `StoreRefused("stale")` when the stored revision is another, `"invalid"` past the store's bound. */
	put(
		kind: PlatformDocumentKind,
		expected: number,
		body: string,
	): Promise<{ revision: number; updatedAt: number }>;
}

/** What the meters count. */
export interface UsageCounts {
	messages: number;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	costMicroUsd: number;
	limitHits: number;
}

export const NO_USAGE: UsageCounts = {
	messages: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHits: 0,
};

/**
 * One meter: a surface, a period (`2026-11` or `2026-11-14` in the app's zone) and whose it is (`org`, or a person's
 * subject for their own day).
 */
export interface UsageKey {
	surface: "staff" | "visitor";
	period: string;
	scope: string;
}

/** The assistants' meters of an app. `add` adds to every key in one transaction; counts only ever grow. */
export interface AssistantUsagePort {
	add(app: string, keys: ReadonlyArray<UsageKey>, delta: UsageCounts): Promise<void>;
	/** The counts of each key, in order (none recorded: zeros). */
	read(app: string, keys: ReadonlyArray<UsageKey>): Promise<UsageCounts[]>;
}

export const usageKeyText = (k: UsageKey): string => `${k.surface}|${k.period}|${k.scope}`;

export function addCounts(a: UsageCounts, b: UsageCounts): UsageCounts {
	return {
		messages: a.messages + b.messages,
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cachedTokens: a.cachedTokens + b.cachedTokens,
		costMicroUsd: a.costMicroUsd + b.costMicroUsd,
		limitHits: a.limitHits + b.limitHits,
	};
}
