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

/** One sentence of a released segment, with the whitespace before it. */
interface Piece {
	lead: string;
	sentence: string;
}

/**
 * Holds the model's text back to the end of each sentence, checks the sentence, then lets it out
 * with its citations renumbered. The checks, in order: the no-content sentinel, the profile's
 * cross-reference rules, a sentence in another language, and faithfulness against everything the
 * model was shown this turn. A faithfulness verdict either lets the sentence out, leaves it out
 * (an unsupported sentence that invents nothing: the rest of the answer still goes out), or stops
 * the answer (an invented figure or name, a citation to a passage never shown, an unsupported
 * promise). Nothing goes out before the first sentence that cites a source (by number, or by
 * pointing to a shown page): an answer that never cites one never shows a word.
 */
export class AnswerGate {
	readonly #rules: GateRules;
	#held = "";
	#tail = "";
	#raw = "";
	#kept = "";
	#pending: Array<Piece> = [];
	/** Whitespace written after the last sentence let through or held, not yet sent: it goes out
	 * exactly as written, before the next sentence (or at the end). */
	#space = "";
	#dropped = 0;
	#claims = 0;
	#cited = false;
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

	/** What went out (or waits for a citation), with its original citation numbers: what is scored. */
	get keptText(): string {
		return this.#kept;
	}

	/** Claim-bearing sentences let through (each one supported by what was shown). */
	get claims(): number {
		return this.#claims;
	}

	/** Sentences left out as unsupported. */
	get dropped(): number {
		return this.#dropped;
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
		const step = this.#release(segment);
		// The answer's own closing whitespace (a final newline) goes out once something did.
		if (step.kind === "text" && this.#emitted && this.#pending.length === 0 && this.#space !== "") {
			const text = step.text + this.#space;
			this.#space = "";
			return { kind: "text", text };
		}
		return step;
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

	/** The segment's sentences, each with the whitespace before it. */
	#pieces(segment: string): Array<Piece> {
		const out: Array<Piece> = [];
		let start = 0;
		let space = "";
		for (const end of [...this.#rules.faithfulness.sentences.ends(segment), segment.length]) {
			const chunk = segment.slice(start, end);
			start = end;
			const sentence = chunk.trim();
			const lead = chunk.slice(0, chunk.length - chunk.trimStart().length);
			if (sentence === "") {
				// A blank line between sentences stays with the sentence after it.
				space += chunk;
				continue;
			}
			out.push({ lead: space + lead, sentence });
			space = "";
		}
		return out;
	}

	#release(segment: string): GateStep {
		this.#raw += segment;
		const stop = this.#screen(segment);
		if (stop !== undefined) {
			this.#refused = true;
			return { kind: "refuse", ...stop };
		}
		const { ledger, faithfulness } = this.#rules;
		const pieces = this.#pieces(segment);
		const out: Array<Piece> = [];
		for (const raw of pieces) {
			// One separator before this sentence: the carried one when it is a line break or the
			// sentence has none of its own, else its own (never both, so no double spaces).
			const carried = this.#space;
			const lead =
				carried === "" ? raw.lead : raw.lead === "" || carried.includes("\n") ? carried : raw.lead;
			const piece: Piece = { lead, sentence: raw.sentence };
			this.#space = "";
			const verdict = faithfulness.assess(piece.sentence, ledger.evidence());
			if (verdict.severity === "refuse") {
				this.#refused = true;
				return { kind: "refuse", reason: "no_content", check: verdict.problem ?? "unsupported" };
			}
			if (verdict.severity === "drop") {
				this.#dropped += 1;
				// The separator before a left-out sentence stands in for the one after it.
				this.#space = piece.lead;
				continue;
			}
			if (verdict.page !== undefined) ledger.citeSource(verdict.page);
			if (verdict.claim) this.#claims += 1;
			this.#kept += `${this.#kept === "" ? "" : piece.lead}${piece.sentence}`;
			if (verdict.cited.length > 0 || verdict.page !== undefined) this.#cited = true;
			if (this.#cited) {
				out.push(...this.#pending, piece);
				this.#pending = [];
			} else {
				this.#pending.push(piece);
			}
		}
		// Whitespace after the segment's last sentence (a paragraph break) waits for the next
		// sentence, so it goes out exactly as written whether or not this one went out now.
		const trail = segment.slice(segment.trimEnd().length);
		if (pieces.length === 0) {
			this.#space += segment;
		} else {
			this.#space = trail === "" ? this.#space : trail;
		}
		const joined = out.map((p) => `${p.lead}${p.sentence}`).join("");
		this.#tail = (this.#tail + segment).slice(-TAIL_KEPT);
		const text = ledger.rewriteCitations(this.#emitted ? joined : joined.trimStart());
		if (text.length > 0) this.#emitted = true;
		return { kind: "text", text };
	}

	/** The checks on the raw segment: the sentinel, the cross-references, the language. */
	#screen(segment: string): { reason: RefusalReason; check: GateCheck } | undefined {
		if (segment.includes(NO_CONTENT_SENTINEL)) return { reason: "no_content", check: "sentinel" };
		// The tail catches a name split across two releases ("Motor-" then "bike").
		for (const rule of this.#rules.crossReferences) {
			if (matchesRules(this.#tail + segment, rule.forbid)) {
				return { reason: rule.refusal, check: "cross_reference" };
			}
		}
		const { faithfulness, languages, locale } = this.#rules;
		for (const sentence of faithfulness.sentences.split(segment)) {
			if (languages.isOther(sentence, locale)) return { reason: "unavailable", check: "language" };
		}
		return undefined;
	}
}
