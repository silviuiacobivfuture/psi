import type { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { MODEL_KEY } from "./agent";
import { type AskContext, report, type ThreadAgent } from "./ask-context";
import { CREATIVITY_TEMPERATURE } from "./behaviour";
import type { Source } from "./contract";
import { within } from "./deadline";
import type { AskInput, EngineEvent, GuideAction, HistoryTurn } from "./events";
import { AnswerTurn, MAX_TOOL_CALLS, TURN_KEY } from "./grounding/agent-tools";
import { type ArticleLink, mentionedArticles } from "./grounding/article-tool";
import { createClaimsCheck } from "./grounding/claims-check";
import type { EvidencePage } from "./grounding/faithfulness";
import type { ScopedSearch } from "./grounding/knowledge-tool";
import { SourceLedger, withoutCitations } from "./grounding/ledger";
import {
	mentionedServices,
	type ServiceFact,
	withoutServiceMarks,
} from "./grounding/services-tool";
import type { LanguagePack } from "./language/pack";
import { forgetAnswer, type ThreadKey } from "./memory";
import { earlierPages, pageEvidence, pagePassage, renderPage } from "./page-context";
import type { ProfileLocale } from "./profile";
import { matchesRules } from "./rules";
import { fold } from "./text/normalize";
import type { AttemptTiming, ToolTiming } from "./timing";

/** Longest reply the model may write, in tokens; room is left for the model's own reasoning. */
const MAX_OUTPUT_TOKENS = 4_096;
/** Model steps per reply: up to `MAX_TOOL_CALLS` tool rounds, then the reply. */
const MAX_STEPS = MAX_TOOL_CALLS + 2;
/**
 * Warm enough to vary a conversational reply; the facts come from the tools, not the model. The
 * owner's `balanced` creativity; `precise` and `creative` move it per turn.
 */
export const ANSWER_TEMPERATURE = CREATIVITY_TEMPERATURE.balanced;
/** The most earlier turns the model reads. */
export const HISTORY_TURNS = 10;

type ModelMessage = { role: "user"; content: string } | { role: "assistant"; content: string };

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

type Attempt =
	| {
			kind: "ok";
			text: string;
			ledger: SourceLedger;
			shown: ReadonlyArray<string>;
			articles: ReadonlyArray<ArticleLink>;
			services: ReadonlyArray<ServiceFact>;
	  }
	/** Clearly in another language after its first sentences: stopped early, to be retried. */
	| { kind: "language" }
	| { kind: "error"; error: unknown };

/** Streamed so far, as the visitor sees it: what `replace` resets. */
export interface Display {
	text: string;
}

/**
 * The longest wait for a model call's first chunk. A provider that has not started by then is
 * stuck (a failing route): the one retry goes out at once instead of after the idle budget.
 */
const FIRST_CHUNK_MS = 8_000;

/** Characters written before the language is judged mid-stream. */
const LANGUAGE_PROBE_CHARS = 80;

/** Removes the gap a dropped citation leaves before a full stop. */
function tidy(text: string): string {
	return text.replace(/[ \t]+([.,;:!?])/g, "$1");
}

/** Where streamed text may be cut: before an unclosed "[", so a citation goes out whole. */
function safeEnd(raw: string): number {
	const open = raw.lastIndexOf("[");
	return open > raw.lastIndexOf("]") && raw.length - open <= 12 ? open : raw.length;
}

/** The turn's clock: when it started, each model call and tool call, the first visible text. */
export interface TurnClock {
	start: number;
	firstText: number | null;
	attempts: Array<AttemptTiming>;
	tools: Array<ToolTiming>;
}

export interface ConverseArgs {
	ctx: AskContext;
	input: AskInput;
	pack: LanguagePack;
	instructions: string;
	/** Per-call notes: the visitor's language, an out-of-scope question. */
	notes: ReadonlyArray<string>;
	search: ScopedSearch;
	signal: AbortSignal;
	/** The visitor's own signal: aborted means a newer question replaced this one. */
	callerSignal: AbortSignal | undefined;
	clock: TurnClock;
	/** The profile's wording for this turn (in the owner's style), for the claims evidence. */
	own: ProfileLocale | undefined;
	/** Copy the owner set that the reply may say as written (the redirect line), as evidence too. */
	ownCopy: ReadonlyArray<string>;
	/** This turn's sampling temperature (the owner's creativity). */
	temperature: number;
	/** The owner's answering model for this turn; undefined: the engine's. */
	model?: string;
}

function conversation(input: AskInput, useHistory: boolean): Array<ModelMessage> {
	const earlier: Array<ModelMessage> = useHistory
		? (input.history ?? [])
				.slice(-HISTORY_TURNS)
				.map(
					(turn): ModelMessage =>
						turn.role === "guide"
							? { role: "assistant", content: turn.text }
							: { role: "user", content: turn.text },
				)
		: [];
	return [...earlier, { role: "user", content: input.question }];
}

/** Resets what the visitor sees, when anything is on screen. */
function* reset(display: Display, text = ""): Generator<EngineEvent, void, undefined> {
	if (display.text === text) return;
	display.text = text;
	yield { type: "replace", text };
}

/**
 * One model call with the profile's tools, streamed: the text goes out as the model writes it
 * (its citations renumbered, a citation never cut in two); text written before a tool call is a
 * preamble and is reset. Returns the reply's whole raw text for the checks.
 */
async function* attempt(
	args: ConverseArgs,
	note: string | undefined,
	runs: Array<Promise<unknown>>,
	display: Display,
): AsyncGenerator<EngineEvent, Attempt, undefined> {
	const { ctx, input, signal } = args;
	const ledger = new SourceLedger();
	const turn = new AnswerTurn(ledger, input.locale, args.search);
	if (input.page !== undefined && input.page.status !== "published") {
		turn.hiddenUrl = input.page.url;
	}
	// The page the visitor is reading: a published page's excerpt is the first, citable source.
	const passage = input.page === undefined ? undefined : pagePassage(input.page);
	const numbered = passage === undefined ? undefined : ledger.register([passage])[0];
	const pageSection =
		input.page === undefined
			? undefined
			: renderPage(
					args.pack,
					input.page,
					numbered?.n,
					earlierPages(input.history ?? [], input.page),
				);
	const threads: ThreadAgent | undefined =
		input.threadId !== undefined && ctx.threadAgent !== undefined ? ctx.threadAgent() : undefined;
	const agent: Agent | undefined = threads?.agent ?? ctx.agent;
	if (agent === undefined) return { kind: "error", error: new Error("no agent") };
	const key: ThreadKey | undefined =
		input.threadId === undefined
			? undefined
			: { threadId: `${ctx.profile.id}-${input.threadId}`, resourceId: ctx.resourceId };
	const system = [
		...args.notes,
		...(pageSection === undefined ? [] : [pageSection]),
		...(note === undefined ? [] : [note]),
	].join("\n\n");
	const t0 = Date.now();
	const timing: AttemptTiming = { firstChunkMs: -1, firstTextMs: null, rounds: 1, ms: 0 };
	try {
		const output = await within(
			agent.stream(conversation(input, threads === undefined), {
				instructions: args.instructions,
				...(system === "" ? {} : { system }),
				requestContext: new RequestContext<unknown>([
					[TURN_KEY, turn],
					...(args.model === undefined ? [] : [[MODEL_KEY, args.model] as const]),
				]),
				maxSteps: MAX_STEPS,
				maxProcessorRetries: 0,
				abortSignal: signal,
				modelSettings: {
					maxRetries: 0,
					maxOutputTokens: MAX_OUTPUT_TOKENS,
					temperature: args.temperature,
				},
				...(threads !== undefined && key !== undefined
					? { memory: { thread: key.threadId, resource: key.resourceId } }
					: {}),
			}),
			Math.min(ctx.timeouts.idleMs, FIRST_CHUNK_MS),
			"model start",
			signal,
		);
		runs.push(output.finishReason.catch(() => undefined));
		const reader = output.fullStream.getReader();
		let raw = "";
		let sent = 0;
		let citer = ledger.citer();
		let judged = false;
		let finish: string | undefined;
		try {
			for (;;) {
				const wait =
					timing.firstChunkMs < 0
						? Math.min(ctx.timeouts.idleMs, FIRST_CHUNK_MS)
						: ctx.timeouts.idleMs;
				const next = await within(reader.read(), wait, "model stream", signal);
				if (next.done) break;
				const chunk = next.value;
				// Mastra opens every stream with its own start chunks: the provider's first is the next.
				if (timing.firstChunkMs < 0 && chunk.type !== "start" && chunk.type !== "step-start") {
					timing.firstChunkMs = Date.now() - t0;
				}
				if (chunk.type === "step-finish") timing.rounds += 1;
				if (chunk.type === "text-delta") {
					raw += chunk.payload.text;
					if (!judged && raw.length >= LANGUAGE_PROBE_CHARS) {
						judged = true;
						if (ctx.languages.isOther(raw, input.locale)) return { kind: "language" };
					}
					const end = safeEnd(raw);
					const piece = raw.slice(sent, end);
					sent = end;
					const shown = tidy(citer.rewrite(display.text === "" ? piece.trimStart() : piece));
					if (shown !== "") {
						timing.firstTextMs ??= Date.now() - t0;
						args.clock.firstText ??= Date.now() - args.clock.start;
						display.text += shown;
						yield { type: "text", delta: shown };
					}
				} else if (chunk.type === "tool-call-input-streaming-start") {
					yield { type: "thinking", stage: "searching" };
				} else if (chunk.type === "tool-call") {
					// Text written before a tool call is a preamble ("let me look"): the reply follows.
					raw = "";
					sent = 0;
					citer = ledger.citer();
					judged = false;
					yield* reset(display);
				} else if (chunk.type === "error") return { kind: "error", error: chunk.payload.error };
				else if (chunk.type === "abort" || chunk.type === "tripwire") {
					return { kind: "error", error: new Error(chunk.type) };
				} else if (chunk.type === "finish") finish = chunk.payload.stepResult.reason;
			}
		} finally {
			reader.cancel().catch(() => undefined);
		}
		if (finish !== "stop") {
			return { kind: "error", error: new Error(`finished with reason ${finish ?? "none"}`) };
		}
		const rest = tidy(citer.rewrite(raw.slice(sent)));
		if (rest !== "") {
			timing.firstTextMs ??= Date.now() - t0;
			args.clock.firstText ??= Date.now() - args.clock.start;
			display.text += rest;
			yield { type: "text", delta: rest };
		}
		if (raw.trim() === "") return { kind: "error", error: new Error("empty reply") };
		return {
			kind: "ok",
			text: raw.trim(),
			ledger,
			shown: turn.shown,
			articles: turn.articles,
			services: turn.services,
		};
	} catch (error) {
		return { kind: "error", error };
	} finally {
		timing.ms = Date.now() - t0;
		// The last step's finish counts as a round too: rounds are steps, not their boundaries.
		timing.rounds = Math.max(1, timing.rounds - 1);
		args.clock.attempts.push(timing);
		args.clock.tools.push(...turn.timings);
	}
}

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
