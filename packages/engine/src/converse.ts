import { report } from "./ask-context";
import { CREATIVITY_TEMPERATURE } from "./behaviour";
import type { Source } from "./contract";
import {
	type Attempt,
	attempt,
	type ConverseArgs,
	type Display,
	reset,
	tidy,
} from "./converse-attempt";
import type { EngineEvent, GuideAction, HistoryTurn } from "./events";
import { mentionedArticles } from "./grounding/article-tool";
import { createClaimsCheck } from "./grounding/claims-check";
import type { EvidencePage } from "./grounding/faithfulness";
import { withoutCitations } from "./grounding/ledger";
import { mentionedServices, withoutServiceMarks } from "./grounding/services-tool";
import { forgetAnswer, type ThreadKey } from "./memory";
import { pageEvidence } from "./page-context";
import { matchesRules } from "./rules";
import { fold } from "./text/normalize";

export {
	type ConverseArgs,
	type Display,
	HISTORY_TURNS,
	type TurnClock,
	type TurnLimits,
} from "./converse-attempt";

/**
 * Warm enough to vary a conversational reply; the facts come from the tools, not the model. The
 * owner's `balanced` creativity; `precise` and `creative` move it per turn.
 */
export const ANSWER_TEMPERATURE = CREATIVITY_TEMPERATURE.balanced;

/** What one reply came to. */
export type ReplyOutcome =
	/** A reply, already on screen: conversation, or facts from the tools with their sources. */
	| {
			kind: "reply";
			sources: ReadonlyArray<Source>;
			/** Articles the reply names, linked whether or not it wrote the address. */
			articles: ReadonlyArray<Source>;
			/** The next steps (buttons) of the services the reply names. */
			actions: ReadonlyArray<GuideAction>;
			/** What the scorer reads: the tool results, the pages, the sentences left out. */
			scoring: {
				passages: Readonly<Record<string, string>>;
				pages: ReadonlyArray<EvidencePage>;
				dropped: number;
				checked: string;
			};
	  }
	/** Still in another language after the stricter retry: the canned line goes out instead. */
	| { kind: "language" }
	/** Every sentence stated an unsupported fact, twice: the honest "not on our site" line. */
	| { kind: "unknown" }
	/** The provider failed twice (network, 5xx, a timeout, an unfinished reply). */
	| { kind: "failed"; error: unknown }
	/** The visitor sent another question, or left: nobody is waiting for this reply. */
	| { kind: "aborted" };

/**
 * What the reply's facts are checked against beyond the tool results: the profile's own text and
 * the copy lines the owner wrote for the guide to say. Never the team's free-text instructions:
 * a note cannot license a fact.
 */
function ownText(args: ConverseArgs): ReadonlyArray<string> {
	const { ctx, input, own } = args;
	const earlier = (input.history ?? []).filter((t) => t.role === "guide").map((t) => t.text);
	return [
		ctx.profile.name,
		...(own === undefined
			? []
			: [
					own.voice,
					own.nextSteps,
					...(own.facts ?? []),
					...(own.unknown === undefined ? [] : [own.unknown]),
				]),
		...args.ownCopy,
		...(input.page === undefined ? [] : pageEvidence(input.page)),
		...earlier,
	];
}

/** The last sentence of a guide turn when it is a question, folded, without citations. */
function closerOf(text: string, split: (t: string) => Array<string>): string | undefined {
	const last = split(withoutCitations(text).trim()).at(-1)?.trim();
	return last?.endsWith("?") === true ? fold(last).trim() : undefined;
}

/** The reply without a closing question already asked earlier in the conversation. */
function withoutRepeatedCloser(
	text: string,
	history: ReadonlyArray<HistoryTurn>,
	split: (t: string) => Array<string>,
): string {
	const closer = closerOf(text, split);
	if (closer === undefined) return text;
	const asked = history
		.filter((t) => t.role === "guide")
		.map((t) => closerOf(t.text, split))
		.filter((c): c is string => c !== undefined);
	if (!asked.includes(closer)) return text;
	const last = split(text.trim()).at(-1) ?? "";
	const cut = text.slice(0, text.lastIndexOf(last)).trimEnd();
	return cut === "" ? text : cut;
}

const same = (a: string, b: string): boolean =>
	a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

/**
 * One conversational turn, streamed: the agent replies with its tools (it decides when to look
 * things up) and the text goes out as it is written. The finished reply is then checked, and a
 * failed check shows as a `replace`:
 * - another language (judged after the first sentences, so it stops early): regenerated once with
 *   a stricter note, then the canned line;
 * - a figure, a price or a clinical fact no tool result (and no profile text) supports, a
 *   cross-reference breach or a grammar slip: regenerated once with a note, then those sentences
 *   are left out (the corrected full text replaces the streamed one);
 * - the same reply as the previous one: regenerated once; a closing question already asked in the
 *   conversation is left out without a regeneration;
 * - a provider failure: retried once.
 * At most two model calls. `display` is what the visitor sees, kept in step with every event.
 */
export async function* converse(
	args: ConverseArgs,
	display: Display,
): AsyncGenerator<EngineEvent, ReplyOutcome, undefined> {
	const { ctx, input } = args;
	const start = Date.now();
	const runs: Array<Promise<unknown>> = [];
	const outcome = yield* decide(args, runs, display);
	// A consented thread keeps only a reply that went out as the model wrote it on the first try:
	// a retried, trimmed or failed one never replays into the next prompt (the question stays).
	const clean = outcome.kind === "reply" && runs.length === 1 && outcome.scoring.dropped === 0;
	const threads = input.threadId !== undefined ? ctx.threadAgent?.() : undefined;
	if (!clean && threads !== undefined && input.threadId !== undefined) {
		const key: ThreadKey = {
			threadId: `${ctx.profile.id}-${input.threadId}`,
			resourceId: ctx.resourceId,
		};
		void forgetAnswer(threads.memory, key, start, Promise.all(runs));
	}
	return outcome;
}

async function* decide(
	args: ConverseArgs,
	runs: Array<Promise<unknown>>,
	display: Display,
): AsyncGenerator<EngineEvent, ReplyOutcome, undefined> {
	const { ctx, input, pack } = args;
	const claims = createClaimsCheck([...ctx.packs.values()], ctx.faithfulness.sentences);
	const split = (t: string): Array<string> => ctx.faithfulness.sentences.split(t);
	const forbidden = (ctx.profile.crossReferences ?? [])
		.filter((rule) => matchesRules(input.question, rule.when))
		.flatMap((rule) => rule.forbid);
	const slips = pack.grammarErrors ?? [];
	const isSlip = (sentence: string): boolean => slips.some((p) => p.test(fold(sentence)));
	const history = input.history ?? [];
	const previous = [...history].reverse().find((t) => t.role === "guide")?.text;
	const aborted = (): boolean => args.callerSignal?.aborted === true;

	let note: string | undefined;
	let last: Attempt | undefined;
	// What the first reply comes to if the retry fails at the provider: never "unavailable" for a
	// reply that only needed a second try.
	let fallback: { outcome: ReplyOutcome; text: string } | undefined;
	for (let round = 0; round < 2; round += 1) {
		if (round > 0) {
			yield { type: "thinking", stage: "checking" };
			yield* reset(display);
		}
		const result = yield* attempt(args, note, runs, display);
		if (aborted()) return { kind: "aborted" };
		last = result;
		const isLast = round === 1;
		if (result.kind === "error") {
			if (fallback !== undefined) {
				yield* reset(display, fallback.text);
				return fallback.outcome;
			}
			if (args.signal.aborted) break;
			note = undefined;
			continue;
		}
		if (result.kind === "language" || ctx.languages.isOther(result.text, input.locale)) {
			if (isLast) return { kind: "language" };
			report(ctx, "check", new Error("regenerated: another language"));
			fallback = { outcome: { kind: "language" }, text: "" };
			note = pack.prompt.strictLanguage ?? pack.prompt.language;
			continue;
		}
		const evidence = {
			passages: [...Object.values(result.ledger.passageTexts()), ...result.shown],
			own: ownText(args),
		};
		const verdict = claims.check(
			result.text,
			evidence,
			(sentence) => (forbidden.length > 0 && matchesRules(sentence, forbidden)) || isSlip(sentence),
		);
		const kept = withoutRepeatedCloser(
			withoutServiceMarks(verdict.kept, result.services),
			history,
			split,
		);
		const citer = result.ledger.citer();
		const text = tidy(citer.rewrite(kept));
		const outcome: ReplyOutcome =
			text.trim() === ""
				? { kind: "unknown" }
				: {
						kind: "reply",
						sources: citer.sources(),
						articles: mentionedArticles(text, result.articles),
						actions: mentionedServices(text, result.services),
						scoring: {
							passages: result.ledger.passageTexts(),
							pages: result.ledger.pages(),
							dropped: verdict.flagged.length,
							checked: kept,
						},
					};
		if (verdict.flagged.length > 0) {
			// Counts only, never the text: the app's log learns how often a check fires.
			const slipped = verdict.flagged.filter(isSlip).length;
			report(
				ctx,
				"check",
				new Error(
					`${isLast ? "left out" : "regenerated"}: ${verdict.flagged.length - slipped} unsupported, ${slipped} grammar`,
				),
			);
		}
		if (verdict.flagged.length > 0 && !isLast) {
			fallback = { outcome, text };
			const slipped = verdict.flagged.some(isSlip);
			const invented = verdict.flagged.some((f) => !isSlip(f));
			note = [
				...(slipped && pack.prompt.grammar !== undefined ? [pack.prompt.grammar] : []),
				...(invented && pack.prompt.factsOnly !== undefined ? [pack.prompt.factsOnly] : []),
			].join("\n\n");
			continue;
		}
		if (
			outcome.kind === "reply" &&
			previous !== undefined &&
			fold(text) === fold(previous) &&
			!isLast
		) {
			fallback = { outcome, text };
			report(ctx, "check", new Error("regenerated: the same reply as the previous one"));
			note = pack.prompt.noRepeat;
			continue;
		}
		if (outcome.kind === "reply" && !same(text, display.text)) yield* reset(display, text);
		return outcome;
	}
	if (aborted()) return { kind: "aborted" };
	return { kind: "failed", error: last?.kind === "error" ? last.error : new Error("no reply") };
}
