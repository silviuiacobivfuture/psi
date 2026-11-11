import { matchesRules, type RuleSet } from "../rules";
import { fold, matchesAny } from "../text/normalize";

/**
 * Chat-template and role markers, matched on the cleaned text before folding: whatever the
 * language, these are written to forge a system or assistant turn.
 */
const TEMPLATE_MARKERS: ReadonlyArray<RegExp> = [
	/<\|?\s*(im_start|im_end|system|endoftext|assistant)\s*\|?>/i,
	/\[\/?(INST|SYS)\]/,
	/<\/?\s*(system|passages|instructions|assistant)\s*>/i,
	/^\s*(system|assistant|developer)\s*:/im,
];

/**
 * True when the text tries to override, reveal or replace the instructions: a template marker,
 * or one of the language packs' injection requests (matched on folded text). The packs' patterns
 * key on the request, not on single words, so "What are the rules for cancelling?" passes.
 * Mastra's `PromptInjectionDetector` covers what they miss.
 */
export function isInjection(text: string, patterns: ReadonlyArray<RegExp>): boolean {
	return TEMPLATE_MARKERS.some((pattern) => pattern.test(text)) || matchesAny(fold(text), patterns);
}

/**
 * True when the question is abuse rather than a question: one of the packs' abuse patterns, and
 * none of the profile's exemptions (a clinic hears swearing as a symptom too, so a question about
 * health or a child is never refused here; Mastra's `ModerationProcessor` judges it in context).
 */
export function isAbusive(
	text: string,
	patterns: ReadonlyArray<RegExp>,
	exemptions: ReadonlyArray<RuleSet>,
): boolean {
	return matchesAny(fold(text), patterns) && !matchesRules(text, exemptions);
}
