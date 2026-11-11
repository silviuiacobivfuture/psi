import type { RefusalReason } from "./events";
import { mentionsSisterBrand } from "./guardrails/scope";
import type { SourceLedger } from "./ledger";

/** What the model writes, alone, when the passages do not answer the question. */
export const NO_CONTENT_SENTINEL = "NO_CONTENT";

export type GateStep = { kind: "text"; text: string } | { kind: "refuse"; reason: RefusalReason };

export interface GateRules {
	ledger: SourceLedger;
	/** Psizone on a clinical question: any mention of Hemi-Sync or EQ-SYNC refuses the answer. */
	blockSisterBrands: boolean;
}

const BOUNDARY = /[.!?…:;](?=\s)|\n/g;
const MAX_HELD = 400;
const PERCENT =
	/(\d+(?:[.,]\d+)?)\s*(?:%|la sută|la suta|de procente|procente|procent|per ?cent)/gi;
const TAIL_KEPT = 24;

/**
 * Holds the model's text back to the end of each sentence, checks the sentence, then lets it out
 * with its citations renumbered. One mechanism covers the post-checks: the no-content sentinel,
 * Psizone naming a sister brand on a clinical question, and percentages the passages do not hold.
 */
export class AnswerGate {
	readonly #rules: GateRules;
	#held = "";
	#tail = "";
	#emitted = false;
	#refused = false;

	constructor(rules: GateRules) {
		this.#rules = rules;
	}

	/** True once any text has been let out. */
	get emitted(): boolean {
		return this.#emitted;
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
		let last = -1;
		for (const match of this.#held.matchAll(BOUNDARY)) last = match.index + match[0].length;
		if (last > 0) return last;
		if (this.#held.length <= MAX_HELD) return 0;
		const space = this.#held.lastIndexOf(" ");
		const open = this.#held.lastIndexOf("[");
		const close = this.#held.lastIndexOf("]");
		const safe = open > close ? Math.min(space, open) : space;
		return safe > 0 ? safe : this.#held.length;
	}

	#release(segment: string): GateStep {
		const verdict = this.#check(segment);
		if (verdict !== undefined) {
			this.#refused = true;
			return { kind: "refuse", reason: verdict };
		}
		this.#tail = (this.#tail + segment).slice(-TAIL_KEPT);
		const text = this.#rules.ledger.rewriteCitations(this.#emitted ? segment : segment.trimStart());
		if (text.length > 0) this.#emitted = true;
		return { kind: "text", text };
	}

	#check(segment: string): RefusalReason | undefined {
		if (segment.includes(NO_CONTENT_SENTINEL)) return "no_content";
		if (this.#rules.blockSisterBrands && mentionsSisterBrand(this.#tail + segment)) {
			return "out_of_scope";
		}
		const corpus = this.#rules.ledger.corpus;
		for (const match of segment.matchAll(PERCENT)) {
			const figure = match[1];
			if (figure !== undefined && !corpus.includes(figure)) return "no_content";
		}
		return undefined;
	}
}
