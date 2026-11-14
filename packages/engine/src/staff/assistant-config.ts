import {
	AssistantEffective,
	type AssistantEffectiveType,
	type AssistantSettingsType,
	type AssistantSkillType,
	type AssistantStopName,
	BUILT_IN_SETTINGS,
	ZERO_METER,
} from "@psi/scheduling-sdk/contract";
import { z } from "zod";
import type { StaffCopy } from "./copy";
import type { TurnRefusal } from "./events";

/**
 * What governs one person's turn: the merged settings (the platform's defaults and ceilings, the organisation's, their
 * roles' and their own), the skills, and a limit that already stops it. The scheduling service merges it; the engine
 * reads it once per turn through the person's own port and never trusts anything else for it.
 */
export type StaffConfig = AssistantEffectiveType;

/** The configuration as the port's answer is parsed (the contract's own schema, at the engine's boundary). */
export const StaffConfigSchema = z.custom<StaffConfig>(
	(v) => AssistantEffective.safeParse(v).success,
);

/** The built-in staff settings, for ports that keep no configuration (tests, the development fake). */
export const BUILT_IN_STAFF_CONFIG: StaffConfig = {
	surface: "staff",
	settings: BUILT_IN_SETTINGS.staff,
	skills: [],
	version: "built-in",
	usage: { month: ZERO_METER, day: ZERO_METER, mine: ZERO_METER },
};

/** What one turn used, as the port reports it to the meters. */
export const StaffUsageSchema = z.object({
	inputTokens: z.number().int().min(0),
	outputTokens: z.number().int().min(0),
	cachedTokens: z.number().int().min(0),
	costMicroUsd: z.number().int().min(0),
	limitHit: z.boolean(),
});
export type StaffUsage = z.infer<typeof StaffUsageSchema>;

export const NO_STAFF_USAGE: StaffUsage = {
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHit: false,
};

/** A stop of the configuration, as the turn refuses it. */
export function refusalOf(stop: AssistantStopName): TurnRefusal {
	switch (stop) {
		case "disabled":
			return "disabled";
		case "budget":
			return "budget";
		case "tokens_month":
		case "tokens_day":
			return "tokens";
		case "messages_day":
			return "messages_day";
		default: {
			const never: never = stop;
			return never;
		}
	}
}

/** The primary model and its fallbacks, as one key (OpenRouter tries them in order). */
export function modelKeyOf(s: AssistantSettingsType): string {
	return [s.model.primary, ...s.model.fallbacks].join(",");
}

export function modelsOfKey(key: string): { primary: string; fallbacks: Array<string> } {
	const [primary = key, ...fallbacks] = key.split(",").filter((m) => m !== "");
	return { primary, fallbacks };
}

const norm = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The skills a message calls for: a skill with no trigger always applies; otherwise one of its triggers is in the message. */
export function skillsFor(
	skills: ReadonlyArray<AssistantSkillType>,
	message: string,
): Array<AssistantSkillType> {
	const text = norm(message);
	return skills.filter(
		(s) => s.triggers.length === 0 || s.triggers.some((t) => text.includes(norm(t))),
	);
}

/**
 * The tools a turn may use when a skill that applies limits them (the union of the applying skills' lists, plus the
 * discovery tools); undefined when none limits them. Never more than the person holds: this only narrows.
 */
export function toolAllowance(
	applying: ReadonlyArray<AssistantSkillType>,
): ReadonlySet<string> | undefined {
	const limited = applying.filter((s) => s.tools !== undefined);
	if (limited.length === 0) return undefined;
	return new Set(limited.flatMap((s) => s.tools ?? []));
}

/**
 * The standing instructions of a turn, stable across the organisation's turns (and so cached by the provider): the
 * engine's own (or the organisation's override), the tone and language, the organisation's addition, and every skill
 * of the surface with its triggers (the model applies one when a trigger appears). Per-turn notes go after it.
 */
export function standingInstructions(copy: StaffCopy, config: StaffConfig): string {
	const s = config.settings;
	// An override replaces the assistant's voice, never its rules: the data fence and confirm-before-change always hold.
	const rules = [
		copy.prompt.rulesHeading,
		...copy.prompt.rules.map((r, i) => `${i + 1}. ${r}`),
	].join("\n");
	const parts = [
		s.prompt.override ?? copy.prompt.language,
		rules,
		copy.prompt.tone(s.tone),
		copy.prompt.replyLanguage(s.language),
	];
	if (s.prompt.append !== undefined && s.prompt.append.trim() !== "")
		parts.push(`${copy.prompt.orgHeading}\n${s.prompt.append.trim()}`);
	if (config.skills.length > 0)
		parts.push(
			[
				copy.prompt.skillsHeading,
				...config.skills.map(
					(k) =>
						`- ${k.name}${k.triggers.length === 0 ? "" : ` (${k.triggers.join(", ")})`}: ${k.description}\n${k.instructions}`,
				),
			].join("\n"),
		);
	return parts.join("\n\n");
}
