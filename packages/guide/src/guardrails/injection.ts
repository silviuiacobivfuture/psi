import { fold, matchesAny } from "./normalize";

/**
 * Prompt injection and jailbreak attempts in Romanian and English, matched deterministically before
 * any model sees the question: asking the guide to drop or reveal its instructions, to take on
 * another role, or to switch to an unrestricted mode, and chat-template control tokens. The
 * patterns key on the request, not on single words, so "Ce reguli aveți pentru programări?" or
 * "Pot să ignor crizele de furie?" pass. Mastra's `PromptInjectionDetector` covers what these miss.
 */
const INSTRUCTIONS_RO = "(instructiunile|instructiuni|regulile|indicatiile|comenzile|setarile)";
const INSTRUCTIONS_EN = "(instructions|prompts?|rules|guidelines|directions|directives)";

/** "Previous", "above", "your": the qualifier that makes "ignore the rules" an attack, not a parent's worry. */
const QUALIFIER_RO = "(anterioare|precedente|de mai sus|initiale|tale|de sistem|primite|ascunse)";
const QUALIFIER_EN = "(previous|prior|above|earlier|preceding|system|original|initial|your)";

const FOLDED: ReadonlyArray<RegExp> = [
	new RegExp(
		`\\b(ignora|ignorati|ignore|uita|uitati|treci peste|incalca|incalcati|nu mai respecta|nu mai tine cont de) (de )?(toate |orice )?${INSTRUCTIONS_RO} ${QUALIFIER_RO}\\b`,
	),
	new RegExp(
		`\\b(arata|aratati|spune|spuneti|afiseaza|repeta|scrie|da)( mi| ne)? ${INSTRUCTIONS_RO} ${QUALIFIER_RO}\\b`,
	),
	/\bprompt(ul)? (de sistem|sistem|initial|ascuns)\b/,
	/\b(de acum( inainte)?|din acest moment),? (esti|vei fi|te comporti ca|raspunzi ca)\b/,
	/\b(prefa te|pretinde) ca (esti|ai fi)\b/,
	/\bmod(ul)? (dezvoltator|developer|fara restrictii|nerestrictionat|necenzurat)\b/,
	new RegExp(
		`\\b(ignore|disregard|forget|override|bypass) (all |any )?(the |these |those )?${QUALIFIER_EN} ${INSTRUCTIONS_EN}\\b`,
	),
	/\b(reveal|show|print|repeat|output|display|tell me|give me|what are|what is) (me )?(all )?your (system |hidden |initial |original )?(instructions|prompt|system message|configuration)\b/,
	/\b(system|developer|hidden) (prompt|message)\b/,
	/\b(you are now|from now on you are|you re now) (an? |my |the )?(unfiltered|unrestricted|uncensored|evil|jailbroken|dan|different|new)\b/,
	/\bfrom now on,? (act|pretend|respond|answer|behave) as\b/,
	/\bpretend (that )?you (are|re)\b/,
	/\b(act|behave|respond) as (if you were |though you were )?(an? )?(unfiltered|unrestricted|uncensored|evil|jailbroken)\b/,
	/\broleplay as\b/,
	/\b(jailbreak|jailbroken|do anything now|dan mode|developer mode|god mode|godmode)\b/,
];

/** Chat-template and role markers, matched on the cleaned text before folding. */
const RAW: ReadonlyArray<RegExp> = [
	/<\|?\s*(im_start|im_end|system|endoftext|assistant)\s*\|?>/i,
	/\[\/?(INST|SYS)\]/,
	/<\/?\s*(system|passages|instructions|assistant)\s*>/i,
	/^\s*(system|assistant|developer)\s*:/im,
];

/** True when the text tries to override, reveal or replace the guide's instructions. */
export function isInjection(text: string): boolean {
	return RAW.some((pattern) => pattern.test(text)) || matchesAny(fold(text), FOLDED);
}
