import type { Locale } from "./contract";
import type { RefusalReason } from "./events";
import { assessSentence, type Unfaithful } from "./faithfulness";
import { isOtherLanguage } from "./guardrails/language";
import { mentionsSisterBrand } from "./guardrails/scope";
import type { SourceLedger } from "./ledger";
import { sentenceEnds, splitSentences } from "./sentences";

/** What the model writes, alone, when the passages do not answer the question. */
export const NO_CONTENT_SENTINEL = "NO_CONTENT";

/** Which check stopped an answer. */
export type GateCheck = "sentinel" | "sister_brand" | "language" | Unfaithful;

export type GateStep =
	| { kind: "text"; text: string }
	| { kind: "refuse"; reason: RefusalReason; check: GateCheck };

export interface GateRules {
	ledger: SourceLedger;
	/** Psizone on a clinical question: any mention of Hemi-Sync or EQ-SYNC refuses the answer. */
	blockSisterBrands: boolean;
	/** The configured language: a sentence clearly in the other one refuses the answer. */
	locale: Locale;
}

/** A run-on longer than this goes out at a word boundary and is checked as one sentence. */
const MAX_HELD = 1000;
const TAIL_KEPT = 24;

/**
 * Holds the model's text back to the end of each sentence, checks the sentence, then lets it out
 * with its citations renumbered. The checks, in order: the no-content sentinel, Psizone naming a
 * sister brand on a clinical question, a sentence in the other language, and faithfulness (a
 * claim must cite a passage it was shown, use only that passage's figures and share its wording).
 * A sentence that fails is never let out.
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
		const last = sentenceEnds(this.#held).at(-1) ?? -1;
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
		if (this.#rules.blockSisterBrands && mentionsSisterBrand(this.#tail + segment)) {
			return { reason: "out_of_scope", check: "sister_brand" };
		}
		const ledger = this.#rules.ledger;
		for (const sentence of splitSentences(segment)) {
			if (isOtherLanguage(sentence, this.#rules.locale)) {
				return { reason: "unavailable", check: "language" };
			}
			const { problem } = assessSentence(sentence, (n) => ledger.passageText(n));
			if (problem !== undefined) return { reason: "no_content", check: problem };
		}
		return undefined;
	}
}
