import { RegexFilterProcessor, type RegexRule } from "@mastra/core/processors";

/**
 * Identifiers Mastra's `pii` preset does not know, because they are Romanian: mobile and landline
 * numbers in the national format, the personal numeric code (CNP) and the IBAN.
 */
export const ROMANIAN_PII_RULES: ReadonlyArray<RegexRule> = [
	{
		name: "ro-phone",
		pattern: /(?:\+40|0040|\b0)[\s.-]?[237]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
		replacement: "[TELEFON]",
	},
	{
		name: "ro-cnp",
		pattern: /\b[1-9]\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{6}\b/g,
		replacement: "[CNP]",
	},
	{
		name: "ro-iban",
		pattern: /\bRO\d{2}\s?[A-Z]{4}(?:\s?[0-9A-Z]{4}){4}\b/gi,
		replacement: "[IBAN]",
	},
];

/**
 * Redacts identifiers from the question and the history before they reach the knowledge search,
 * the model or memory: Mastra's `pii` preset (e-mail, phone, card, SSN) plus the Romanian rules.
 * Questions to a clinic are special-category health data; with the identifiers gone, what the
 * visitor tells about a condition can no longer be tied to them. It never refuses, and it runs on
 * input only: the passages may hold the clinic's own phone number, and the answer may repeat it.
 * Names are not redacted: that needs a model (Mastra's `PIIDetector`), and practitioners' names
 * are legitimate questions.
 */
export function piiRedactor(): RegexFilterProcessor {
	return new RegexFilterProcessor({
		presets: ["pii"],
		rules: [...ROMANIAN_PII_RULES],
		strategy: "redact",
		phase: "input",
	});
}
