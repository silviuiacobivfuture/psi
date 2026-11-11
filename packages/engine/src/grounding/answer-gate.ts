import type { RefusalReason } from "../events";
import type { LanguageDetector } from "../language/detect";
import { NO_CONTENT_SENTINEL } from "../prompt";
import { matchesRules, type RuleSet } from "../rules";
import type { Faithfulness, Unfaithful } from "./faithfulness";
import type { SourceLedger } from "./ledger";

/** Which check stopped an answer. */
export type GateCheck = "sentinel" | "cross_reference" | "language" | Unfaithful;

export type GateStep =
	| { kind: "text"; text: string }
	| { kind: "refuse"; reason: RefusalReason; check: GateCheck };

/** A cross-reference rule that applies to this answer: what it may not name, and the refusal. */
export interface ActiveCrossReference {
	forbid: ReadonlyArray<RuleSet>;
	refusal: RefusalReason;
}

export interface GateRules {
	ledger: SourceLedger;
	/** The profile's cross-reference rules whose `when` matched the question. */
	crossReferences: ReadonlyArray<ActiveCrossReference>;
	/** The configured language: a sentence clearly in another one refuses the answer. */
	locale: string;
	languages: LanguageDetector;
	faithfulness: Faithfulness;
}

/** A run-on longer than this goes out at a word boundary and is checked as one sentence. */
const MAX_HELD = 1000;
const TAIL_KEPT = 24;

/**
 * Holds the model's text back to the end of each sentence, checks the sentence, then lets it out
 * with its citations renumbered. The checks, in order: the no-content sentinel, the profile's
 * cross-reference rules, a sentence in another language, and faithfulness (a claim must cite a
 * passage it was shown, use only that passage's figures and share its wording). A sentence that
 * fails is never let out.
 */
export class AnswerGate {
	readonly #rules: GateRules;
	#held = "";
	#tail = "";
	#raw = "";
	#emitted = false;
	#refused = false;

	constructor(rules: GateRules) {
		this.#rules = rules;
	}

	/** True once any text has been let out. */
	get emitted(): boolean {
		return this.#emitted;
	}

	/** Everything the model wrote that reached a check, with its original citation numbers. */
	get rawText(): string {
		return this.#raw;
	}

	/** Takes a delta; returns the checked text that may go out now, or a refusal. */
	push(delta: string): GateStep {
		if (this.#refused) return { kind: "text", text: "" };
		this.#held += delta;
		const cut = this.#cutPoint();
		if (cut <= 0) return { kind: "text", text: "" };
		const segment = this.#held.slice(0, cut);
		this.#held = this.#held.slice(cut);
		return this.#release(segment);
	}

	/** Drops held text that was not let out yet: a preamble the model wrote before a tool call. */
	discardHeld(): void {
		this.#held = "";
	}

	/** Releases whatever is still held at the end of the answer. */
	end(): GateStep {
		if (this.#refused) return { kind: "text", text: "" };
		const segment = this.#held;
		this.#held = "";
		return this.#release(segment);
	}

	#cutPoint(): number {
		// Text goes out a whole sentence at a time, so each check sees complete sentences.
		const last = this.#rules.faithfulness.sentences.ends(this.#held).at(-1) ?? -1;
		if (last > 0) return last;
		if (this.#held.length <= MAX_HELD) return 0;
		const space = this.#held.lastIndexOf(" ");
		const open = this.#held.lastIndexOf("[");
		const close = this.#held.lastIndexOf("]");
		const safe = open > close ? Math.min(space, open) : space;
		return safe > 0 ? safe : this.#held.length;
	}

	#release(segment: string): GateStep {
		this.#raw += segment;
		const verdict = this.#check(segment);
		if (verdict !== undefined) {
			this.#refused = true;
			return { kind: "refuse", ...verdict };
		}
		this.#tail = (this.#tail + segment).slice(-TAIL_KEPT);
		const text = this.#rules.ledger.rewriteCitations(this.#emitted ? segment : segment.trimStart());
		if (text.length > 0) this.#emitted = true;
		return { kind: "text", text };
	}

	#check(segment: string): { reason: RefusalReason; check: GateCheck } | undefined {
		if (segment.includes(NO_CONTENT_SENTINEL)) return { reason: "no_content", check: "sentinel" };
		// The tail catches a name split across two releases ("Motor-" then "bike").
		for (const rule of this.#rules.crossReferences) {
			if (matchesRules(this.#tail + segment, rule.forbid)) {
				return { reason: rule.refusal, check: "cross_reference" };
			}
		}
		const { ledger, faithfulness, languages, locale } = this.#rules;
		for (const sentence of faithfulness.sentences.split(segment)) {
			if (languages.isOther(sentence, locale)) return { reason: "unavailable", check: "language" };
			const { problem } = faithfulness.assess(sentence, (n) => ledger.passageText(n));
			if (problem !== undefined) return { reason: "no_content", check: problem };
		}
		return undefined;
	}
}
