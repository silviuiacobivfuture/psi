import { createScorer } from "@mastra/core/evals";
import type { LanguagePack } from "../language/pack";
import { fold } from "../text/normalize";
import { createSentences, type Sentences } from "../text/sentences";
import { citedNumbers, withoutCitations } from "./ledger";

/**
 * Faithfulness of an answer to the passages it cites, checked deterministically. `@mastra/evals`
 * (model-judged faithfulness and hallucination scorers) is not installed, so the check is the
 * engine's own, wrapped in Mastra's `createScorer` for the whole-answer score. The same sentence
 * assessment runs in the answer gate before each sentence goes out, so an unfaithful sentence is
 * never streamed.
 *
 * A claim-bearing sentence is supported when it cites at least one passage it was shown, every
 * figure in it appears in the passages it cites, and at least half of its content words (by
 * four-letter stem, so inflections match: "lucrăm" and "lucrează") appear in them too.
 */
export const MIN_SUPPORT = 0.5;

/** Every claim-bearing sentence must be supported: one unsupported claim fails the answer. */
export const FAITHFULNESS_THRESHOLD = 1;

const STEM = 4;
/** The most content stems a next step may have and still go uncited. */
const NEXT_STEP_MAX_STEMS = 4;
const QUESTION = /\?\s*$/;
const DIGIT = /\d/;
const FIGURE = /\d+(?:[.,]\d+)?/g;

/** Why a sentence is not faithful. */
export type Unfaithful = "uncited" | "figure" | "unsupported";

export interface SentenceVerdict {
	/** True when the sentence states something that must come from the passages. */
	claim: boolean;
	/** The passage numbers it cites that the model was actually shown. */
	cited: ReadonlyArray<number>;
	/** Share of its content stems found in the passages it cites (1 when it has none). */
	support: number;
	/** True when every figure in it appears in the passages it cites. */
	figures: boolean;
	/** What is wrong with it, or undefined when it is faithful (or not a claim). */
	problem: Unfaithful | undefined;
}

/** Looks up everything the model was shown for one source number. */
export type PassageLookup = (n: number) => string | undefined;

/** The faithfulness of one answer: how many of its claims the cited passages support. */
export interface EngineScore {
	/** The scorer's id (`createEngine({ scorerId })`). */
	scorer: string;
	/** Supported claims over claims, 0 to 1 (0 when the answer makes no claim at all). */
	score: number;
	claims: number;
	supported: number;
	/** True when the answer may be shown: at least one claim, and every claim supported. */
	passed: boolean;
}

/** What the scorer reads: the passages by source number (the answer is the run's output). */
export interface FaithfulnessInput {
	passages: Readonly<Record<string, string>>;
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

function buildScorer(id: string, tally: (answer: string, input: FaithfulnessInput) => Tally) {
	return createScorer<FaithfulnessInput, string, string>({
		id,
		name: id,
		description:
			"Share of claim-bearing sentences that cite a passage, use only its figures and share its wording.",
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
	/** Assesses one sentence of an answer against the passages it cites. */
	assess(sentence: string, lookup: PassageLookup): SentenceVerdict;
	/** Scores a complete answer; never sees or returns the question. */
	score(answer: string, passages: Readonly<Record<string, string>>): Promise<EngineScore>;
}

export interface FaithfulnessOptions {
	scorerId: string;
	/** The languages answers are written in: their stop words, courtesies, next steps, abbreviations. */
	packs: ReadonlyArray<LanguagePack>;
	/** Further next-step phrases the profiles allow uncited (folded), e.g. "use headphones". */
	nextSteps?: ReadonlyArray<string>;
}

export function createFaithfulness(opts: FaithfulnessOptions): Faithfulness {
	const stopwords = new Set(opts.packs.flatMap((pack) => pack.stopwords));
	const sentences = createSentences(opts.packs.flatMap((pack) => pack.abbreviations));
	const courtesy = new RegExp(
		`^ (${alternation(opts.packs.flatMap((pack) => pack.courtesies))})\\b`,
	);
	const nextStep = new RegExp(
		`\\b(${alternation([...opts.packs.flatMap((pack) => pack.nextSteps), ...(opts.nextSteps ?? [])])})\\b`,
	);

	const stems = (text: string): Set<string> => {
		const out = new Set<string>();
		for (const word of fold(text).split(/[^a-z0-9]+/)) {
			if (word.length < 3 || stopwords.has(word) || /^\d+$/.test(word)) continue;
			out.add(word.slice(0, STEM));
		}
		return out;
	};

	const assess = (sentence: string, lookup: PassageLookup): SentenceVerdict => {
		const cited = [...new Set(citedNumbers(sentence))].filter((n) => lookup(n) !== undefined);
		const plain = withoutCitations(sentence);
		const folded = fold(plain);
		const own = stems(plain);
		const hasFigure = DIGIT.test(plain);
		const claim =
			!QUESTION.test(plain) &&
			!courtesy.test(folded) &&
			(hasFigure || (own.size >= 2 && !(nextStep.test(folded) && own.size <= NEXT_STEP_MAX_STEMS)));
		const sourceText = cited.map((n) => lookup(n) ?? "").join("\n");
		const sourceStems = stems(sourceText);
		const shared = [...own].filter((stem) => sourceStems.has(stem)).length;
		const support = own.size === 0 ? 1 : shared / own.size;
		const figures = [...plain.matchAll(FIGURE)].every((match) => figureIn(match[0], sourceText));
		let problem: Unfaithful | undefined;
		if (claim && cited.length === 0) problem = "uncited";
		else if (claim && !figures) problem = "figure";
		else if (claim && support < MIN_SUPPORT) problem = "unsupported";
		return { claim, cited, support, figures, problem };
	};

	const tally = (answer: string, input: FaithfulnessInput): Tally => {
		const lookup: PassageLookup = (n) => input.passages[String(n)];
		let claims = 0;
		let supported = 0;
		for (const sentence of sentences.split(answer)) {
			const verdict = assess(sentence, lookup);
			if (!verdict.claim) continue;
			claims += 1;
			if (verdict.problem === undefined) supported += 1;
		}
		return { claims, supported };
	};

	const scorer = buildScorer(opts.scorerId, tally);

	return {
		sentences,
		scorer,
		assess,
		async score(answer, passages) {
			const result = await scorer.run({ input: { passages }, output: answer });
			const counts = result.preprocessStepResult ?? { claims: 0, supported: 0 };
			const score = result.score ?? 0;
			return {
				scorer: opts.scorerId,
				score,
				claims: counts.claims,
				supported: counts.supported,
				passed: counts.claims > 0 && score >= FAITHFULNESS_THRESHOLD,
			};
		},
	};
}
