import { RegexFilterProcessor, type RegexRule } from "@mastra/core/processors";

/**
 * Redacts identifiers from the question and the history before they reach the knowledge search,
 * the model or memory: Mastra's `pii` preset (e-mail, phone, card, SSN) plus the language packs'
 * own rules (national phone formats, personal numbers, IBANs). It never refuses, and it runs on
 * input only: the passages may hold the organisation's own phone number, and the answer may
 * repeat it. Names are not redacted: that needs a model (Mastra's `PIIDetector`), and the names
 * of the people a site presents are legitimate questions.
 */
export function piiRedactor(rules: ReadonlyArray<RegexRule>): RegexFilterProcessor {
	return new RegexFilterProcessor({
		presets: ["pii"],
		rules: [...rules],
		strategy: "redact",
		phase: "input",
	});
}
