import type { RegexRule } from "@mastra/core/processors";
import { BUNDLED_LANGUAGES } from "../language/index";

/**
 * What the logs never hold when redaction is on: an e-mail address and an international phone number (the shapes
 * Mastra's `pii` preset covers for the question), then every bundled language pack's own identifier rules (national
 * phone formats, the personal number, IBANs) — the same rules the question is redacted with before the model sees it.
 */
const LOG_RULES: ReadonlyArray<RegexRule> = [
	{
		name: "email",
		pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
		replacement: "[EMAIL]",
	},
	...BUNDLED_LANGUAGES.flatMap((pack) => pack.pii),
	{
		name: "phone",
		pattern: /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b/g,
		replacement: "[PHONE]",
	},
	// A long run of digits is an identifier of someone (a personal number in any format), never a fact worth a log.
	{ name: "digits", pattern: /\b\d{9,}\b/g, replacement: "[NUMBER]" },
];

/** The text with every identifier the rules know replaced by its mark. Pure; the rules' state is reset each time. */
export function redactIdentifiers(text: string): string {
	let out = text;
	for (const rule of LOG_RULES) {
		const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`;
		out = out.replace(new RegExp(rule.pattern.source, flags), rule.replacement ?? "[REDACTED]");
	}
	return out;
}
