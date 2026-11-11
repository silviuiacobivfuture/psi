import { createScorer } from "@mastra/core/evals";
import { fold } from "./guardrails/normalize";
import { citedNumbers, withoutCitations } from "./ledger";
import { splitSentences } from "./sentences";

/**
 * Faithfulness of an answer to the passages it cites, checked deterministically. `@mastra/evals`
 * (which ships model-judged faithfulness and hallucination scorers) is not installed, so the check
 * is the guide's own, wrapped in Mastra's `createScorer` for the whole-answer score. The same
 * sentence assessment runs in the answer gate before each sentence goes out, so an unfaithful
 * sentence is never streamed.
 *
 * A claim-bearing sentence is supported when it cites at least one passage it was shown, every
 * figure in it appears in the passages it cites, and at least half of its content words (by
 * four-letter stem, so Romanian inflections match: "lucrăm" and "lucrează") appear in them too.
 */
export const MIN_SUPPORT = 0.5;

/** Every claim-bearing sentence must be supported: one unsupported claim fails the answer. */
export const FAITHFULNESS_THRESHOLD = 1;

const STEM = 4;

/** Function words of both languages, which say nothing about what a sentence claims. */
const STOPWORDS = new Set(
	[
		"si sau este sunt era fost fi care pentru cu din la de pe ce cum nu un una unei unui mai sa se ca",
		"dar al ale lui ei acest aceasta acesta aceste acestea noi voi eu tu el ea avem aveti are au am",
		"unde cand cat cate poate pot puteti poti daca despre meu mea tau ta nostru noastra va vor iti",
		"te ne le ii lor prin dupa inainte intre spre sub fara doar foarte tot toate toti orice fiecare",
		"asa atunci acum aici deci insa iar cel cea cei cele the and are was were been for with what how",
		"does did can could will would should may might this that these those there their them they you",
		"your our ours has have had from into about after before between than then also just only very",
		"each every any all not but its who whom which when where why yes",
	]
		.join(" ")
		.split(" "),
);

const QUESTION = /\?\s*$/;
const COURTESY =
	/^ (buna ziua|buna seara|buna|salut|multumim|multumesc|cu drag|hello|hi|thank you|thanks)\b/;
/** A next step the brand voices ask for: booking, contact, a recommended evaluation. */
/**
 * A next step the brand voices ask for: booking, contact, a recommended evaluation, an article or a
 * hub to read next, headphones for EQ-SYNC. It needs no citation only while it is short, so it
 * cannot carry a claim.
 */
const NEXT_STEP =
	/\b(programa|programare|programarea|programeaza|programati|rezerva|rezervare|contacteaza|contactati|suna|sunati|scrie ne|scrieti ne|te asteptam|va asteptam|recomandam|recomand|citeste|cititi|vezi|vedeti|afla|aflati|descopera|exploreaza|acceseaza|foloseste casti|folositi casti|book|booking|schedule|get in touch|contact us|call us|recommend|suggest|reach out|read|see|visit|explore|learn more|find out|check out|use headphones)\b/;
/** The most content stems a next step may have and still go uncited. */
const NEXT_STEP_MAX_STEMS = 4;
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

function stems(text: string): Set<string> {
	const out = new Set<string>();
	for (const word of fold(text).split(/[^a-z0-9]+/)) {
		if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
		out.add(word.slice(0, STEM));
	}
	return out;
}

function normalFigure(figure: string): string {
	return figure.replace(",", ".");
}

function figureIn(figure: string, text: string): boolean {
	const escaped = normalFigure(figure).replace(".", "\\.");
	return new RegExp(`(?<![\\d.])${escaped}(?!\\d)`).test(text.replace(/(\d),(\d)/g, "$1.$2"));
}

/** Assesses one sentence of an answer against the passages it cites. */
export function assessSentence(sentence: string, lookup: PassageLookup): SentenceVerdict {
	const cited = [...new Set(citedNumbers(sentence))].filter((n) => lookup(n) !== undefined);
	const plain = withoutCitations(sentence);
	const folded = fold(plain);
	const own = stems(plain);
	const hasFigure = DIGIT.test(plain);
	const claim =
		!QUESTION.test(plain) &&
		!COURTESY.test(folded) &&
		(hasFigure || (own.size >= 2 && !(NEXT_STEP.test(folded) && own.size <= NEXT_STEP_MAX_STEMS)));
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
}

/** The faithfulness of one answer: how many of its claims the cited passages support. */
export interface GuideScore {
	scorer: "psi-faithfulness";
	/** Supported claims over claims, 0 to 1 (0 when the answer makes no claim at all). */
	score: number;
	claims: number;
	supported: number;
	/** True when the answer may be shown: at least one claim, and every claim supported. */
	passed: boolean;
}

/** What the scorer reads: the answer as the model wrote it, and the passages by source number. */
export interface FaithfulnessInput {
	passages: Readonly<Record<string, string>>;
}

interface Tally {
	claims: number;
	supported: number;
}

function tally(answer: string, input: FaithfulnessInput | undefined): Tally {
	const lookup: PassageLookup = (n) => input?.passages[String(n)];
	let claims = 0;
	let supported = 0;
	for (const sentence of splitSentences(answer)) {
		const verdict = assessSentence(sentence, lookup);
		if (!verdict.claim) continue;
		claims += 1;
		if (verdict.problem === undefined) supported += 1;
	}
	return { claims, supported };
}

/** Mastra's scorer for the whole answer, after it is complete. */
export const faithfulnessScorer = createScorer<FaithfulnessInput, string, "psi-faithfulness">({
	id: "psi-faithfulness",
	name: "psi faithfulness",
	description:
		"Share of claim-bearing sentences that cite a passage, use only its figures and share its wording.",
})
	.preprocess(({ run }) => tally(run.output, run.input))
	.generateScore(({ results }) => {
		const { claims, supported } = results.preprocessStepResult;
		return claims === 0 ? 0 : supported / claims;
	});

/** Scores a complete answer; never sees or returns the question. */
export async function scoreAnswer(
	answer: string,
	passages: Readonly<Record<string, string>>,
): Promise<GuideScore> {
	const result = await faithfulnessScorer.run({ input: { passages }, output: answer });
	const counts = result.preprocessStepResult ?? { claims: 0, supported: 0 };
	const score = result.score ?? 0;
	return {
		scorer: "psi-faithfulness",
		score,
		claims: counts.claims,
		supported: counts.supported,
		passed: counts.claims > 0 && score >= FAITHFULNESS_THRESHOLD,
	};
}
