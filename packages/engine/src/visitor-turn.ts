import type { AssistantSettingsType } from "@psi/scheduling-sdk/contract";
import type { TurnLimits } from "./converse-attempt";
import type { EngineEvent } from "./events";
import type { LanguagePack } from "./language/pack";
import type { ProfileFallback } from "./profile";
import { type ModelUsage, NO_MODEL_USAGE } from "./usage";

/** What one governed turn may use: the stored settings, as the reply's own limits. */
export function turnLimitsOf(s: AssistantSettingsType): TurnLimits {
	return {
		maxOutputTokens: Math.min(s.maxOutputTokens, s.tokens.perRequest),
		maxToolCalls: s.maxToolCalls,
		historyTurns: s.memory.historyMessages,
		perRequestTokens: s.tokens.perRequest,
		idleMs: s.timeouts.idleMs,
	};
}

/** The answering model and its fallbacks as one key (`primary,fallback…`; the engine builds one model per key). */
export function modelKeyOf(s: AssistantSettingsType): string {
	return [s.model.primary, ...s.model.fallbacks].join(",");
}

/** The key's primary model and its fallbacks, in order. */
export function modelsOfKey(key: string): { primary: string; fallbacks: Array<string> } {
	const [primary = key, ...fallbacks] = key.split(",").filter((m) => m !== "");
	return { primary, fallbacks };
}

/** The organisation's limits stopped the turn: the profile's warm line and its button, said as written. */
export function pausedEvents(fallback: ProfileFallback | undefined): ReadonlyArray<EngineEvent> {
	if (fallback === undefined) return [{ type: "refusal", reason: "unavailable" }, { type: "done" }];
	return [
		{ type: "text", delta: fallback.paused },
		{ type: "actions", actions: [{ kind: "link", ...fallback.action }] },
		{ type: "done" },
	];
}

/** The offer of a person after the conversation's refusals: the organisation's contact, else the profile's own. */
export function personEvents(
	fallback: ProfileFallback,
	settings: AssistantSettingsType,
): ReadonlyArray<EngineEvent> {
	const contact = settings.handoff.contact?.trim();
	return [
		{
			type: "text",
			delta: fallback.person(contact === undefined || contact === "" ? fallback.contact : contact),
		},
		{ type: "actions", actions: [{ kind: "link", ...fallback.action }] },
		{ type: "done" },
	];
}

const DAY_MS = 86_400_000;
const MAX_TRACKED = 20_000;

/** Refusals per conversation, for the hand-over to a person; a conversation is forgotten a day after its last one. */
export interface RefusalCounter {
	/** Counts one refusal in the conversation; how many it has had now. */
	add(conversation: string): number;
}

export function createRefusalCounter(now: () => number = Date.now): RefusalCounter {
	const held = new Map<string, { count: number; at: number }>();
	return {
		add(conversation) {
			const at = now();
			const before = held.get(conversation);
			const count = before === undefined || at - before.at > DAY_MS ? 1 : before.count + 1;
			held.delete(conversation);
			if (held.size >= MAX_TRACKED) held.delete(held.keys().next().value ?? "");
			held.set(conversation, { count, at });
			return count;
		},
	};
}

/** Addresses and international numbers, beside the packs' own national formats and personal numbers. */
const EMAIL = /[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[a-z]{2,}/gi;
const PHONE = /\+\d[\d\s.-]{7,}\d/g;

/**
 * Hides e-mail addresses, phone numbers and personal numbers in a text the engine is about to log: the language packs'
 * own rules (the screening's PII rules), then addresses and international numbers.
 */
export function createRedactor(packs: ReadonlyArray<LanguagePack>): (text: string) => string {
	const rules = packs.flatMap((pack) => pack.pii);
	return (text) => {
		let out = text.replace(EMAIL, "[EMAIL]");
		for (const rule of rules) {
			const pattern = new RegExp(
				rule.pattern.source,
				rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`,
			);
			out = out.replace(pattern, rule.replacement ?? "[REDACTED]");
		}
		return out.replace(PHONE, "[TELEFON]");
	};
}

/** Several model calls' use as one. */
export function sumUsage(list: ReadonlyArray<ModelUsage>): ModelUsage {
	return list.reduce(
		(a, b) => ({
			inputTokens: a.inputTokens + b.inputTokens,
			outputTokens: a.outputTokens + b.outputTokens,
			cachedTokens: a.cachedTokens + b.cachedTokens,
			costMicroUsd: a.costMicroUsd + b.costMicroUsd,
		}),
		NO_MODEL_USAGE,
	);
}
