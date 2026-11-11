import { type DetectedLanguage, MIXED, UNKNOWN } from "./language/detect";
import type { LanguagePack } from "./language/pack";
import type { ProfileLocale } from "./profile";

/** What the model writes, alone, when the passages do not answer the question. */
export const NO_CONTENT_SENTINEL = "NO_CONTENT";

/**
 * The system prompt for one profile in one locale: the language first, the profile's voice, then
 * the numbered rules: the pack's grounding rules, the profile's policy, the pack's closing rules.
 */
export function instructionsFor(pack: LanguagePack, locale: ProfileLocale): string {
	const rules = [
		...pack.prompt.grounding({ sentinel: NO_CONTENT_SENTINEL, nextSteps: locale.nextSteps }),
		...locale.policy,
		...pack.prompt.closing,
	].map((rule, i) => `${i + 1}. ${rule}`);
	return `${pack.prompt.language}\n\n${locale.voice}\n\n${[pack.prompt.rulesHeading, ...rules].join("\n")}`;
}

/** The per-call note on the visitor's language, or an empty string when they wrote in the locale. */
export function languageNote(pack: LanguagePack, detected: DetectedLanguage): string {
	if (detected === MIXED) return pack.prompt.mixedLanguage;
	if (detected !== UNKNOWN && detected !== pack.locale) return pack.prompt.otherLanguage(detected);
	return "";
}
