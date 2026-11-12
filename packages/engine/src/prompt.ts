import { DEFAULT_BEHAVIOUR, isDefaultStyle, type TurnBehaviour } from "./behaviour";
import { type DetectedLanguage, MIXED, UNKNOWN } from "./language/detect";
import type { LanguagePack } from "./language/pack";
import type { ProfileLocale } from "./profile";

/** What the model writes, alone, when the passages do not answer the question. */
export const NO_CONTENT_SENTINEL = "NO_CONTENT";

/** The profile's wording in the owner's style: its own `restyle`, or as written for the default. */
export function styledLocale(locale: ProfileLocale, behaviour: TurnBehaviour): ProfileLocale {
	if (isDefaultStyle(behaviour.style) || locale.restyle === undefined) return locale;
	return { ...locale, ...locale.restyle(behaviour.style) };
}

/** The team's notes for this locale, as the section's lines; empty when there are none. */
function teamNotes(pack: LanguagePack, b: TurnBehaviour): ReadonlyArray<string> {
	const words = pack.prompt.teamNotes;
	if (words === undefined) return [];
	const redirect = b.copy[pack.locale]?.outOfScope;
	const lines = [
		...(b.focusTopics.length > 0 ? [words.focus(b.focusTopics)] : []),
		...(b.avoidTopics.length > 0 ? [words.avoid(b.avoidTopics)] : []),
		...(redirect === undefined ? [] : [words.redirect(redirect)]),
		...(b.extraInstructions === "" ? [] : [`${words.extra}\n${b.extraInstructions}`]),
	];
	return lines.length === 0 ? [] : [words.heading, ...lines, words.end];
}

/**
 * The system prompt for one profile in one locale: the language first, the profile's voice, then
 * the numbered rules: the pack's grounding rules, the profile's policy, the owner's contact route,
 * the pack's closing rules. The owner's style rewrites the voice, the policy and the pack's own
 * style rules in place (never appended beside them, so nothing contradicts). The team's notes
 * (topics, the redirect line, free-text instructions) come last, between markers, with one more
 * rule saying they rank below every rule above. The safety rules are never touched: with the
 * default behaviour this is exactly the profile's prompt as written.
 */
export function instructionsFor(
	pack: LanguagePack,
	locale: ProfileLocale,
	behaviour: TurnBehaviour = DEFAULT_BEHAVIOUR,
): string {
	const own = styledLocale(locale, behaviour);
	const notes = teamNotes(pack, behaviour);
	const route =
		behaviour.contactRoute === undefined || pack.prompt.contactRoute === undefined
			? []
			: [pack.prompt.contactRoute(behaviour.contactRoute)];
	const priority =
		notes.length === 0 || pack.prompt.teamNotes === undefined
			? []
			: [pack.prompt.teamNotes.priority];
	const rules = [
		...pack.prompt.grounding({
			sentinel: NO_CONTENT_SENTINEL,
			nextSteps: own.nextSteps,
			...(isDefaultStyle(behaviour.style) ? {} : { style: behaviour.style }),
		}),
		...own.policy,
		...route,
		...pack.prompt.closing,
		...priority,
	].map((rule, i) => `${i + 1}. ${rule}`);
	const head = `${pack.prompt.language}\n\n${own.voice}\n\n${[pack.prompt.rulesHeading, ...rules].join("\n")}`;
	return notes.length === 0 ? head : `${head}\n\n${notes.join("\n")}`;
}

/** The per-call note on the visitor's language, or an empty string when they wrote in the locale. */
export function languageNote(pack: LanguagePack, detected: DetectedLanguage): string {
	if (detected === MIXED) return pack.prompt.mixedLanguage;
	if (detected !== UNKNOWN && detected !== pack.locale) return pack.prompt.otherLanguage(detected);
	return "";
}
