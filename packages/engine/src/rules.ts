import { z } from "zod";
import { fold, matchesAny } from "./text/normalize";

/**
 * A deterministic rule, as data: it matches when any of `patterns` matches the folded text (see
 * `fold`) and none of `unless` does. Profiles describe their crisis, scope, abuse-exemption and
 * cross-reference rules as lists of these, so an engine never hard-codes a domain's words.
 */
export interface RuleSet {
	patterns: ReadonlyArray<RegExp>;
	/** Exemptions: text matching any of these is not matched by the set. */
	unless?: ReadonlyArray<RegExp>;
}

const Patterns = z.array(z.instanceof(RegExp)).readonly();

export const RuleSetSchema: z.ZodType<RuleSet> = z
	.object({ patterns: Patterns, unless: Patterns.optional() })
	.strict();

export const RuleSetsSchema: z.ZodType<ReadonlyArray<RuleSet>> = z.array(RuleSetSchema).readonly();

/** True when one rule set matches already folded text. */
export function matchesRuleSet(folded: string, set: RuleSet): boolean {
	return matchesAny(folded, set.patterns) && !matchesAny(folded, set.unless ?? []);
}

/** True when any of the rule sets matches the text (folded here). */
export function matchesRules(text: string, sets: ReadonlyArray<RuleSet>): boolean {
	if (sets.length === 0) return false;
	const folded = fold(text);
	return sets.some((set) => matchesRuleSet(folded, set));
}
