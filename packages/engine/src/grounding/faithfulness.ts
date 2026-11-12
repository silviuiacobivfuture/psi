import { createScorer } from "@mastra/core/evals";
import type { LanguagePack } from "../language/pack";
import { fold } from "../text/normalize";
import { createSentences, type Sentences } from "../text/sentences";
import { citedNumbers, withoutCitations } from "./ledger";

/**
 * Faithfulness of an answer to the passages it was shown, checked deterministically. `@mastra/evals`
 * (model-judged faithfulness and hallucination scorers) is not installed, so the check is the
 * engine's own, wrapped in Mastra's `createScorer` for the whole-answer score. The same sentence
 * assessment runs in the answer gate before each sentence goes out.
 *
 * A claim is measured against EVERY passage shown this turn, not only the one it cites: a
 * paraphrase that keeps the passages' facts passes. Words are folded (case, diacritics) and
 * stemmed lightly (a four-letter prefix, so "lucrăm" and "lucrează" match); function words do not
 * count. Facts must match exactly:
 * - figures (numbers, phone numbers, prices, durations): in a passage shown this turn;
 * - names and addresses (capitalised words mid-sentence, domains, e-mails, URLs): in a passage, a
 *   source title or the profiles' own names.
 *
 * Verdicts: `ok`; `drop` (the sentence is left out of the answer: it adds nothing the passages
 * hold, but invents no fact either); `refuse` (the answer stops: an invented figure or name, a
 * citation to a passage never shown, or an unsupported sentence carrying a claim marker such as
 * "cures", "treats", "guarantees").
 */
export const MIN_SUPPORT = 0.5;

/** Every claim-bearing sentence that went out must be supported. */
export const FAITHFULNESS_THRESHOLD = 1;

const STEM = 4;
/** The most content stems a next step may have and still go uncited. */
const NEXT_STEP_MAX_STEMS = 4;
/** The most content stems a warm opener or closing line may have and still not be a claim. */
const WARM_MAX_STEMS = 6;
/** The most content stems a short line pointing to a shown page may have. */
const PAGE_LINE_MAX_STEMS = 8;
const QUESTION = /\?\s*$/;
const DIGIT = /\d/;
const FIGURE = /\d+(?:[.,]\d+)?/g;
const ADDRESS = /^(https?:\/\/\S+|\S+@\S+\.\S+|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})$/i;
const CAPITALISED = /^\p{Lu}[\p{L}\p{N}]+$|^\p{Lu}{2,}[\p{L}\p{N}]*$/u;
/** A word right after one of these starts a list item or a clause: its capital says nothing. */
const CLAUSE_START = /[:;(«"„“”\-–—•*]$|^\d+[.)]$/;

/** Why a sentence is not faithful. */
export type Unfaithful = "uncited" | "figure" | "entity" | "promise" | "unsupported";

/** What happens to a sentence: it goes out, it is left out, or it stops the answer. */
export type Severity = "ok" | "drop" | "refuse";

export interface SentenceVerdict {
	/** True when the sentence states something that must come from the passages. */
	claim: boolean;
	/** The passage numbers it cites that the model was actually shown. */
	cited: ReadonlyArray<number>;
	/** Share of its content stems found in the passages shown (1 when it has none). */
	support: number;
	/** True when every figure in it appears where it must (see above). */
	figures: boolean;
	/** What is wrong with it, or undefined when it is faithful (or not a claim). */
	problem: Unfaithful | undefined;
	severity: Severity;
	/** A shown page the sentence points to without citing it ("on the contact page…"). */
	page: number | undefined;
}

/** A source the model was shown, as a page a sentence may point to. */
export interface EvidencePage {
	n: number;
	title: string;
	url: string;
}

/** Everything the model was shown this turn. */
export interface Evidence {
	/** The passage text shown for source number `n`, or undefined when `n` is not a source. */
	passage(n: number): string | undefined;
	/** Every passage text shown, joined. */
	all: string;
	pages: ReadonlyArray<EvidencePage>;
}

/** The faithfulness of one answer: how many of its claims the passages support. */
export interface EngineScore {
	/** The scorer's id (`createEngine({ scorerId })`). */
	scorer: string;
	/** Supported claims over claims, 0 to 1 (0 when the answer makes no claim at all). */
	score: number;
	claims: number;
	supported: number;
	/** True when the answer may be shown: at least one claim, and every claim supported. */
	passed: boolean;
	/** Sentences the gate left out of the answer as unsupported (they are not in `claims`). */
	dropped: number;
}

/** What the scorer reads: the passages by source number, and the pages (the answer is the output). */
export interface FaithfulnessInput {
	passages: Readonly<Record<string, string>>;
	pages?: ReadonlyArray<EvidencePage>;
}

interface Tally {
	claims: number;
	supported: number;
}

function escaped(phrase: string): string {
	return phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternation(phrases: ReadonlyArray<string>): string {
	return [...new Set(phrases)].map(escaped).join("|");
}

function normalFigure(figure: string): string {
	return figure.replace(",", ".");
}

function figureIn(figure: string, text: string): boolean {
	const pattern = normalFigure(figure).replace(".", "\\.");
	return new RegExp(`(?<![\\d.])${pattern}(?!\\d)`).test(text.replace(/(\d),(\d)/g, "$1.$2"));
}

/** Evidence from passages by number (the scorer's input, or a test's). */
export function evidenceFrom(
	passages: Readonly<Record<string, string>>,
	pages: ReadonlyArray<EvidencePage> = [],
): Evidence {
	return {
		passage: (n) => passages[String(n)],
		all: Object.values(passages).join("\n"),
		pages,
	};
}

/** Names and addresses in a sentence, as written: the facts that must match a passage. */
function entities(plain: string, abbreviations: ReadonlySet<string>): Array<string> {
	const words = plain.split(/\s+/).filter((w) => w !== "");
	const out: Array<string> = [];
	words.forEach((raw, i) => {
		const word = raw.replace(/^[«"„“([]+|[.,;:!?…»"”)\]]+$/g, "");
		if (ADDRESS.test(word) && /[a-z]/i.test(word)) {
			out.push(word.toLowerCase());
			return;
		}
		const previous = words[i - 1];
		if (
			i === 0 ||
			previous === undefined ||
			CLAUSE_START.test(previous) ||
			// After a sentence end, a capital says nothing; after "dr." or "str." it starts a name.
			(/[.!?…]$/.test(previous) && !abbreviations.has(fold(previous.replace(/\.$/, "")).trim()))
		) {
			return;
		}
		const head = word.split(/[-‐‑'’]/)[0] ?? "";
		if (head.length >= 2 && CAPITALISED.test(head)) out.push(head);
	});
	return out;
}

function buildScorer(id: string, tally: (answer: string, input: FaithfulnessInput) => Tally) {
	return createScorer<FaithfulnessInput, string, string>({
		id,
		name: id,
		description:
			"Share of claim-bearing sentences whose facts and wording come from the passages shown.",
	})
		.preprocess(({ run }) => tally(run.output, run.input ?? { passages: {} }))
		.generateScore(({ results }) => {
			const { claims, supported } = results.preprocessStepResult;
			return claims === 0 ? 0 : supported / claims;
		});
}

/** The Mastra scorer the engine registers (`mastra.getScorer("faithfulness")`). */
export type FaithfulnessScorer = ReturnType<typeof buildScorer>;

export interface Faithfulness {
	readonly sentences: Sentences;
	/** Mastra's scorer for the whole answer, after it is complete. */
	readonly scorer: FaithfulnessScorer;
	/** Assesses one sentence of an answer against what the model was shown. */
	assess(sentence: string, evidence: Evidence): SentenceVerdict;
	/** Scores the answer that went out; never sees or returns the question. */
	score(
		answer: string,
		passages: Readonly<Record<string, string>>,
		opts?: { pages?: ReadonlyArray<EvidencePage>; dropped?: number },
	): Promise<EngineScore>;
}

export interface FaithfulnessOptions {
	scorerId: string;
	/** The languages answers are written in: their stop words, courtesies, next steps, abbreviations. */
	packs: ReadonlyArray<LanguagePack>;
	/** Further next-step phrases the profiles allow uncited (folded), e.g. "use headphones". */
	nextSteps?: ReadonlyArray<string>;
	/** Names an answer may use without a passage holding them: the profiles' own names. */
	knownNames?: ReadonlyArray<string>;
}

export function createFaithfulness(opts: FaithfulnessOptions): Faithfulness {
	const stopwords = new Set(opts.packs.flatMap((pack) => pack.stopwords));
	const abbreviations = new Set(opts.packs.flatMap((pack) => pack.abbreviations));
	const sentences = createSentences(opts.packs.flatMap((pack) => pack.abbreviations));
	const courtesy = new RegExp(
		`^ (${alternation(opts.packs.flatMap((pack) => pack.courtesies))})\\b`,
	);
	const nextStep = new RegExp(
		`\\b(${alternation([...opts.packs.flatMap((pack) => pack.nextSteps), ...(opts.nextSteps ?? [])])})\\b`,
	);
	const warmPhrases = opts.packs.flatMap((pack) => pack.warmth ?? []);
	const warmth =
		warmPhrases.length === 0 ? undefined : new RegExp(`\\b(${alternation(warmPhrases)})\\b`);
	const markers = opts.packs.flatMap((pack) => pack.claimMarkers ?? []);
	const marker = markers.length === 0 ? undefined : new RegExp(`\\b(${alternation(markers)})`);
	const known = fold((opts.knownNames ?? []).join(" "));

	const stems = (text: string): Set<string> => {
		const out = new Set<string>();
		for (const word of fold(text).split(/[^a-z0-9]+/)) {
			if (word.length < 3 || stopwords.has(word) || /^\d+$/.test(word)) continue;
			out.add(word.slice(0, STEM));
		}
		return out;
	};

	/** Stems of everything shown, per evidence object (each turn builds its own). */
	const shown = new WeakMap<Evidence, { stems: Set<string>; folded: string }>();
	const shownOf = (evidence: Evidence): { stems: Set<string>; folded: string } => {
		let entry = shown.get(evidence);
		if (entry === undefined) {
			const titles = evidence.pages.map((p) => `${p.title} ${p.url}`).join("\n");
			entry = { stems: stems(evidence.all), folded: fold(`${evidence.all}\n${titles}`) };
			shown.set(evidence, entry);
		}
		return entry;
	};

	const nameShown = (name: string, folded: string): boolean => {
		const f = fold(name).trim();
		const head = f.slice(0, Math.max(STEM, f.length - 2));
		return folded.includes(` ${head}`) || folded.includes(f) || known.includes(` ${head}`);
	};

	const pageOf = (own: Set<string>, evidence: Evidence): number | undefined => {
		if (own.size > PAGE_LINE_MAX_STEMS) return undefined;
		for (const page of evidence.pages) {
			const path = page.url.replace(/^https?:\/\/[^/]+/i, "").replace(/[/_.-]+/g, " ");
			const keys = stems(path);
			if ([...keys].some((k) => own.has(k))) return page.n;
		}
		return undefined;
	};

	const assess = (sentence: string, evidence: Evidence): SentenceVerdict => {
		const numbers = [...new Set(citedNumbers(sentence))];
		const cited = numbers.filter((n) => evidence.passage(n) !== undefined);
		const phantom = numbers.length > cited.length;
		const plain = withoutCitations(sentence);
		const folded = fold(plain);
		const own = stems(plain);
		const hasFigure = DIGIT.test(plain);
		const promising = marker?.test(folded) === true;
		// A warm opener or closing ("Of course — booking is simple.") carries no fact: it is kept.
		const warm =
			!promising && !hasFigure && warmth?.test(folded) === true && own.size <= WARM_MAX_STEMS;
		const claim =
			!QUESTION.test(plain) &&
			!(courtesy.test(folded) && !promising) &&
			!warm &&
			(hasFigure || (own.size >= 2 && !(nextStep.test(folded) && own.size <= NEXT_STEP_MAX_STEMS)));
		const all = shownOf(evidence);
		const shared = [...own].filter((stem) => all.stems.has(stem)).length;
		const support = own.size === 0 ? 1 : shared / own.size;
		const figures = [...plain.matchAll(FIGURE)].every((match) => figureIn(match[0], evidence.all));
		const verdict = (
			problem: Unfaithful | undefined,
			severity: Severity,
			page?: number,
		): SentenceVerdict => ({ claim, cited, support, figures, problem, severity, page });
		// Facts are checked in every sentence, a next step or a question included.
		if (phantom) return verdict("uncited", "refuse");
		if (!figures) return verdict("figure", "refuse");
		if (entities(plain, abbreviations).some((name) => !nameShown(name, all.folded))) {
			return verdict("entity", "refuse");
		}
		if (!claim) return verdict(undefined, "ok");
		if (support >= MIN_SUPPORT) return verdict(undefined, "ok");
		const page = cited.length === 0 ? pageOf(own, evidence) : undefined;
		if (page !== undefined) return verdict(undefined, "ok", page);
		if (promising) return verdict("promise", "refuse");
		return verdict("unsupported", "drop");
	};

	const tally = (answer: string, input: FaithfulnessInput): Tally => {
		const evidence = evidenceFrom(input.passages, input.pages);
		let claims = 0;
		let supported = 0;
		for (const sentence of sentences.split(answer)) {
			const v = assess(sentence, evidence);
			if (!v.claim) continue;
			claims += 1;
			if (v.severity === "ok") supported += 1;
		}
		return { claims, supported };
	};

	const scorer = buildScorer(opts.scorerId, tally);

	return {
		sentences,
		scorer,
		assess,
		async score(answer, passages, extra) {
			const input: FaithfulnessInput = {
				passages,
				...(extra?.pages === undefined ? {} : { pages: extra.pages }),
			};
			const result = await scorer.run({ input, output: answer });
			const counts = result.preprocessStepResult ?? { claims: 0, supported: 0 };
			const score = result.score ?? 0;
			return {
				scorer: opts.scorerId,
				score,
				claims: counts.claims,
				supported: counts.supported,
				passed: counts.claims > 0 && score >= FAITHFULNESS_THRESHOLD,
				dropped: extra?.dropped ?? 0,
			};
		},
	};
}
