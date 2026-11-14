import { type AskContext, type AskControl, ConfigurationError, report } from "./ask-context";
import {
	handover,
	LIMITS,
	rawLocale,
	recordTurn,
	type TurnMeter,
	transcribe,
} from "./ask-governed";
import { exchangeLimit, screen } from "./ask-screen";
import { CREATIVITY_TEMPERATURE, DEFAULT_BEHAVIOUR, type TurnBehaviour } from "./behaviour";
import { bookingPauseOf, bookingTurn, reshow } from "./booking";
import { converse, type Display, type TurnClock } from "./converse";
import type { AskInput, EngineEvent, RefusalReason } from "./events";
import { scopeSearch } from "./grounding/knowledge-tool";
import { handoffEvents } from "./handoff";
import type { LanguagePack } from "./language/pack";
import type { ProfileLocale } from "./profile";
import { instructionsFor, languageNote, styledLocale } from "./prompt";
import type { PauseNotice } from "./scheduling/port";
import { screenWithModel } from "./screening/model";
import { createSmallTalk } from "./small-talk";
import { foldConversation } from "./visitor-compaction";
import { modelKeyOf, pausedEvents, turnLimitsOf } from "./visitor-turn";

export { ANSWER_TEMPERATURE } from "./converse";

function refusal(reason: RefusalReason): ReadonlyArray<EngineEvent> {
	return [{ type: "refusal", reason }, { type: "done" }];
}

/**
 * The profile's canned line for this turn, when the model cannot reply: the thank-you, the
 * follow-up (after an answered turn) or the welcome. Undefined when the profile has none.
 */
function cannedLine(ctx: AskContext, input: AskInput): string | undefined {
	const own = ctx.profile.locales[input.locale];
	if (own?.welcome === undefined) return undefined;
	const talk = createSmallTalk([...ctx.packs.values()]);
	if (talk.isThanks(input.question)) return own.thanks ?? own.welcome;
	const answeredBefore = (input.history ?? []).some((turn) => turn.role === "guide");
	const line = answeredBefore ? (own.followUp ?? own.welcome) : own.welcome;
	const previous = [...(input.history ?? [])].reverse().find((t) => t.role === "guide")?.text;
	// Never the same line twice in a row.
	return line === previous ? (line === own.welcome ? (own.followUp ?? line) : own.welcome) : line;
}

/** True when the question is only small talk (or names no topic): the canned line fits it. */
function isSmallTalk(ctx: AskContext, input: AskInput): boolean {
	const talk = createSmallTalk([...ctx.packs.values()]);
	return talk.is(input.question) || !talk.hasDomainTerms(input.question);
}

/**
 * The pack, the profile's wording in the owner's style and the system prompt for the asked locale
 * (validation guarantees the locale exists).
 */
function localeOf(
	ctx: AskContext,
	locale: string,
	behaviour: TurnBehaviour,
	pause?: PauseNotice,
): { pack: LanguagePack; own: ProfileLocale; instructions: string } {
	const pack = ctx.packs.get(locale);
	const own = ctx.profile.locales[locale];
	if (pack === undefined || own === undefined) {
		throw new ConfigurationError(`profile ${ctx.profile.id} has no locale ${locale}`);
	}
	return {
		pack,
		own: styledLocale(own, behaviour),
		instructions: instructionsFor(
			pack,
			own,
			behaviour,
			pause === undefined
				? undefined
				: {
						message: locale === "en" ? pause.message.en : pause.message.ro,
						callbacksOpen: pause.callbacksOpen,
					},
		),
	};
}

/**
 * One turn of the conversation, as events. The deterministic screen first (crisis, the limits,
 * injection and abuse, PII redaction), a booking question to the scheduling offer, then the
 * profile's agent with its tools and the conversation so far: it replies to small talk, feelings
 * and unclear messages in conversation, and looks facts up with its tools before stating them,
 * citing them. The reply's factual claims are post-checked (see `converse`). `unavailable` only
 * when the provider failed twice; an aborted turn (a newer question replaced it) ends with `done`
 * alone. Never throws and never hangs: every wait has a deadline.
 */
export async function* runAsk(
	ctx: AskContext,
	raw: unknown,
	control?: AskControl,
): AsyncGenerator<EngineEvent, void, undefined> {
	const clock: TurnClock & { screenMs: number; canned: boolean } = {
		start: Date.now(),
		firstText: null,
		attempts: [],
		tools: [],
		screenMs: 0,
		canned: false,
	};
	const meter: TurnMeter = { usages: [], limitHit: false, governance: undefined };
	let outcome = "reply";
	let answer = "";
	let handedOver = false;
	try {
		for await (const event of turn(ctx, raw, control, clock, meter)) {
			if (handedOver) continue;
			if (event.type === "refusal") {
				// The conversation's refusals reached the organisation's number: a person is offered instead.
				const person = handover(ctx, raw, control, meter.governance, event.reason);
				if (person !== undefined) {
					handedOver = true;
					outcome = "handoff";
					yield* person;
					continue;
				}
				outcome = `refusal:${event.reason}`;
			} else if (event.type === "booking") outcome = "booking";
			else if (event.type === "text") answer += event.delta;
			else if (event.type === "replace") answer = event.text;
			yield event;
		}
	} finally {
		if (ctx.governance !== undefined) await recordTurn(ctx, meter);
		if (outcome === "reply" && answer.trim() !== "") transcribe(ctx, raw, answer);
		if (clock.canned) outcome = "canned";
		if (control?.signal?.aborted === true) outcome = "aborted";
		try {
			ctx.onTiming?.({
				profile: ctx.profile.id,
				screenMs: clock.screenMs,
				firstTextMs: clock.firstText,
				totalMs: Date.now() - clock.start,
				attempts: clock.attempts,
				tools: clock.tools,
				outcome,
			});
		} catch {
			// A failing log hook must not change the answer.
		}
	}
}

async function* turn(
	ctx: AskContext,
	raw: unknown,
	control: AskControl | undefined,
	clock: TurnClock & { screenMs: number; canned: boolean },
	meter: TurnMeter,
): AsyncGenerator<EngineEvent, void, undefined> {
	const signal = control?.signal;
	// A function, not a narrowed property: the signal can abort while the turn awaits.
	const aborted = (): boolean => signal?.aborted === true;
	const screened = await screen(ctx, raw, control);
	clock.screenMs = Date.now() - clock.start;
	meter.governance = screened.governance;
	if (aborted()) {
		yield { type: "done" };
		return;
	}
	if ("stop" in screened) {
		// The organisation's own limit (switched off, the budget, the tokens): no model is asked.
		meter.limitHit = true;
		clock.canned = true;
		yield* pausedEvents(ctx.profile.locales[rawLocale(ctx, raw)]?.fallback);
		return;
	}
	if ("reason" in screened) {
		if (LIMITS.has(screened.reason) && screened.governance !== undefined) meter.limitHit = true;
		yield* refusal(screened.reason);
		return;
	}
	const { input, settings, outOfScope, typed, exchangeDeferred, governance } = screened;
	const behaviour = settings.behaviour ?? DEFAULT_BEHAVIOUR;
	const copy = behaviour.copy[input.locale] ?? {};
	if (ctx.booking !== undefined) {
		const offer = await bookingTurn(
			governance === undefined
				? ctx.booking
				: {
						...ctx.booking,
						limits: {
							horizonDays: governance.settings.booking.horizonDays,
							offerCallback: governance.settings.booking.offerCallback,
						},
					},
			{
				question: input.question,
				typed,
				locale: input.locale,
				...(input.booking === undefined ? {} : { state: input.booking }),
			},
			[...ctx.packs.values()],
		);
		if (offer !== undefined) {
			yield { type: "booking", offer };
			yield { type: "done" };
			return;
		}
	}
	if (exchangeDeferred) {
		const limited = await exchangeLimit(ctx, control, settings, governance);
		if (limited !== undefined) {
			if (LIMITS.has(limited) && governance !== undefined) meter.limitHit = true;
			yield* refusal(limited);
			return;
		}
	}
	const handoff = handoffEvents(ctx, input);
	if (handoff !== undefined) {
		clock.canned = true;
		yield* handoff;
		return;
	}
	// What the visitor sees so far: a canned line after streamed text replaces it.
	const display: Display = { text: "" };
	const say = function* (line: string): Generator<EngineEvent, void, undefined> {
		clock.canned = true;
		if (display.text === "") clock.firstText ??= Date.now() - clock.start;
		yield display.text === "" ? { type: "text", delta: line } : { type: "replace", text: line };
		yield { type: "done" };
	};
	const fallback = function* (error: unknown): Generator<EngineEvent, void, undefined> {
		report(ctx, "model", error);
		const line = isSmallTalk(ctx, input) ? cannedLine(ctx, input) : undefined;
		if (line === undefined) {
			yield* refusal("unavailable");
			return;
		}
		yield* say(line);
	};
	if (ctx.agent === undefined) {
		yield* fallback(new ConfigurationError("no OpenRouter API key (OPENROUTER_API_KEY)"));
		return;
	}
	yield { type: "thinking" };

	const controller = new AbortController();
	const abort = (): void => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (aborted()) controller.abort();
	const deadline = setTimeout(
		abort,
		governance === undefined
			? ctx.timeouts.totalMs
			: Math.min(ctx.timeouts.totalMs, governance.settings.timeouts.totalMs),
	);
	try {
		// While booking is paused the model is told so, whatever the question (a reply that offers times would mislead).
		const pause = ctx.booking === undefined ? undefined : await bookingPauseOf(ctx.booking);
		const { pack, own, instructions } = localeOf(ctx, input.locale, behaviour, pause);
		const search = scopeSearch({
			knowledge: ctx.knowledge,
			scope: ctx.profile.knowledgeScope,
			locale: input.locale,
			timeoutMs: ctx.timeouts.retrievalMs,
			signal: controller.signal,
			mode: {
				tier: settings.embeddings === "lexical" ? "lexical" : "auto",
				deep: settings.deepSearch,
				...(settings.embedModel === undefined ? {} : { embedModel: settings.embedModel }),
			},
		});

		// The model detectors run only at the strict level, and fail OPEN.
		if (ctx.screeningModel !== undefined && settings.screeningLevel === "strict") {
			let providerError: unknown;
			const verdict = await screenWithModel({
				model: ctx.screeningModel((error) => {
					providerError ??= error;
				}),
				question: input.question,
				timeoutMs: ctx.timeouts.screeningMs,
				signal: controller.signal,
				prompts: ctx.profile.screening,
				runnerName: `${ctx.resourceId}-screening`,
			});
			if (aborted()) {
				yield { type: "done" };
				return;
			}
			if (verdict.kind === "failed") report(ctx, "screening", providerError ?? verdict.error);
			if (verdict.kind === "refuse") {
				yield* refusal(verdict.reason);
				return;
			}
		}

		const note = languageNote(pack, ctx.languages.detect(input.question));
		const folded =
			governance === undefined
				? {}
				: await foldConversation(ctx, input, governance.settings, controller.signal);
		if (folded.usage !== undefined) meter.usages.push(Promise.resolve(folded.usage));
		const notes = [
			...(note === "" ? [] : [note]),
			...(folded.note === undefined ? [] : [folded.note]),
			...(outOfScope && pack.prompt.outOfScope !== undefined ? [pack.prompt.outOfScope] : []),
			...(ctx.booking !== undefined && pack.prompt.scheduling !== undefined
				? [pack.prompt.scheduling]
				: []),
		];
		const outcome = yield* converse(
			{
				ctx,
				input,
				pack,
				instructions,
				notes,
				search,
				signal: controller.signal,
				callerSignal: signal,
				clock,
				own,
				// The owner's lines the reply may say as written: "not on our site" always, the redirect
				// only on a turn that is out of scope (it never licenses a fact anywhere else).
				ownCopy: [
					...(copy.unknown === undefined ? [] : [copy.unknown]),
					...(copy.outOfScope === undefined || !outOfScope ? [] : [copy.outOfScope]),
				],
				// On a governed site the organisation's model and temperature supersede the CMS's.
				...(governance === undefined
					? {
							temperature: CREATIVITY_TEMPERATURE[behaviour.creativity],
							...(behaviour.model === undefined ? {} : { model: behaviour.model }),
						}
					: {
							temperature: governance.settings.temperature,
							model: modelKeyOf(governance.settings),
							limits: turnLimitsOf(governance.settings),
							usages: meter.usages,
						}),
			},
			display,
		);
		switch (outcome.kind) {
			case "aborted":
				yield { type: "done" };
				return;
			case "failed":
				yield* fallback(outcome.error);
				return;
			case "calendar": {
				// Never "I cannot see the calendar" where the calendar is the site's own: what the
				// visitor sees is replaced by the booking's offer (the chosen time, or the free times).
				if (display.text !== "") yield { type: "replace", text: "" };
				if (ctx.booking === undefined) {
					yield* refusal("unavailable");
					return;
				}
				yield {
					type: "booking",
					offer: await reshow(ctx.booking, input.booking, input.question, input.locale),
				};
				yield { type: "done" };
				return;
			}
			case "language": {
				report(ctx, "model", new Error("reply not in the configured language after a retry"));
				const line = cannedLine(ctx, input);
				if (line === undefined) {
					yield* refusal("no_content");
					return;
				}
				yield* say(line);
				return;
			}
			case "unknown": {
				const line = copy.unknown ?? own.unknown ?? cannedLine(ctx, input);
				if (line === undefined) {
					yield* refusal("no_content");
					return;
				}
				yield* say(line);
				return;
			}
			case "reply":
				if (outcome.sources.length > 0) {
					// Scored by Mastra's scorer and reported, never shown: the post-check decided.
					try {
						const score = await ctx.faithfulness.score(
							outcome.scoring.checked,
							outcome.scoring.passages,
							{ pages: outcome.scoring.pages, dropped: outcome.scoring.dropped },
						);
						ctx.onScore?.(score);
					} catch {
						// Scoring and its hook never change the reply.
					}
				}
				{
					const linked = new Set(outcome.sources.map((s) => s.url));
					const chips = [...outcome.sources, ...outcome.articles.filter((a) => !linked.has(a.url))];
					if (chips.length > 0) yield { type: "sources", sources: chips };
				}
				if (outcome.actions.length > 0) yield { type: "actions", actions: outcome.actions };
				yield { type: "done" };
				return;
		}
	} catch (error) {
		if (aborted()) {
			yield { type: "done" };
			return;
		}
		yield* fallback(error);
	} finally {
		clearTimeout(deadline);
		signal?.removeEventListener("abort", abort);
		controller.abort();
	}
}
