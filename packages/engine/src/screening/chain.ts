import { type MastraDBMessage, MessageList, TripWire } from "@mastra/core/agent";
import { noopLogger } from "@mastra/core/logger";
import {
	type ProcessInputArgs,
	type Processor,
	ProcessorRunner,
	type RegexRule,
	UnicodeNormalizer,
} from "@mastra/core/processors";
import type { AskInput, HistoryTurn, RefusalReason } from "../events";
import type { RuleSet } from "../rules";
import { piiRedactor } from "./pii";
import { isAbusive, isInjection } from "./rules";
import { LookalikeFolder } from "./unicode";

/** The text of a Mastra message: its text parts, or its plain content. */
export function messageText(message: MastraDBMessage): string {
	const parts = message.content.parts
		.map((part) => (part.type === "text" ? part.text : ""))
		.join("");
	if (parts.length > 0) return parts;
	return typeof message.content.content === "string" ? message.content.content : "";
}

/** A deterministic rule as a Mastra input processor: it aborts the run when the rule matches. */
class RuleProcessor<TId extends string> implements Processor<TId> {
	readonly id: TId;
	readonly name: string;
	readonly #matches: (text: string) => boolean;

	constructor(id: TId, name: string, matches: (text: string) => boolean) {
		this.id = id;
		this.name = name;
		this.#matches = matches;
	}

	processInput(args: ProcessInputArgs): Array<MastraDBMessage> {
		for (const message of args.messages) {
			if (this.#matches(messageText(message))) args.abort(`${this.name} matched`);
		}
		return args.messages;
	}
}

const INJECTION_RULES = "injection-rules";
const ABUSE_RULES = "abuse-rules";

/** The refusal each aborting step of the chain stands for. */
const REFUSAL_BY_PROCESSOR: Readonly<Record<string, RefusalReason>> = {
	[INJECTION_RULES]: "injection",
	[ABUSE_RULES]: "abuse",
};

/** What the deterministic chain checks with: the packs' word lists and the profile's exemptions. */
export interface ScreeningRules {
	injection: ReadonlyArray<RegExp>;
	abuse: ReadonlyArray<RegExp>;
	abuseExemptions: ReadonlyArray<RuleSet>;
	pii: ReadonlyArray<RegexRule>;
	/** Mastra's `agentName` for the runner, for its own bookkeeping. */
	runnerName: string;
}

/**
 * The deterministic chain, cheapest and most certain first; none of it calls a model:
 * 1. Mastra `UnicodeNormalizer`: NFKC, control characters, whitespace.
 * 2. `LookalikeFolder`: invisible characters and Cyrillic or Greek look-alike letters.
 * 3. Injection rules (`injection`), on the question and on every history turn: forged history is
 *    an injection route too.
 * 4. Abuse rules (`abuse`), on the question only: a refused question an app kept in its history
 *    must not refuse every later one.
 * 5. Mastra `RegexFilterProcessor`, redacting identifiers before search, the model and memory.
 */
function chain(rules: ScreeningRules, isQuestion: boolean): ProcessorRunner {
	const steps: Array<Processor> = [
		new UnicodeNormalizer({ stripControlChars: true, collapseWhitespace: true, trim: true }),
		new LookalikeFolder(),
		new RuleProcessor(INJECTION_RULES, "Injection rules", (text) =>
			isInjection(text, rules.injection),
		),
		...(isQuestion
			? [
					new RuleProcessor(ABUSE_RULES, "Abuse rules", (text) =>
						isAbusive(text, rules.abuse, rules.abuseExemptions),
					),
				]
			: []),
		piiRedactor(rules.pii),
	];
	return new ProcessorRunner({
		inputProcessors: steps,
		logger: noopLogger,
		agentName: rules.runnerName,
	});
}

type Screened = { text: string } | { reason: RefusalReason };

/** Screens one message with a fresh runner, so no processor state is shared between asks. */
async function screenText(
	rules: ScreeningRules,
	text: string,
	role: "user" | "assistant",
	isQuestion: boolean,
): Promise<Screened> {
	const runner = chain(rules, isQuestion);
	const list = new MessageList();
	if (role === "user") list.add({ role: "user", content: text }, "input");
	else list.add({ role: "assistant", content: text }, "input");
	try {
		const out = await runner.runInputProcessors(list);
		return { text: out.get.input.db().map(messageText).join("\n") };
	} catch (error) {
		if (error instanceof TripWire) {
			const reason = REFUSAL_BY_PROCESSOR[error.processorId ?? ""];
			if (reason !== undefined) return { reason };
		}
		throw error;
	}
}

const KEEP_MARK = "§K";

/** Hides the strings to keep behind marks the redaction rules do not touch. */
function mask(text: string, keep: ReadonlyArray<string>): string {
	return keep.reduce((t, k, i) => t.split(k).join(`${KEEP_MARK}${i}${KEEP_MARK}`), text);
}

function unmask(text: string, keep: ReadonlyArray<string>): string {
	return keep.reduce((t, k, i) => t.split(`${KEEP_MARK}${i}${KEEP_MARK}`).join(k), text);
}

/**
 * Runs the deterministic chain over the question and the history. Returns the input as the model
 * may see it (cleaned and redacted), or the refusal a rule matched. A question that is empty once
 * cleaned is `invalidInput` (the profile's refusal policy), like any other question the engine
 * cannot take as asked. Throws only on a failure of the chain itself, which the caller turns into
 * `unavailable`.
 */
export async function screenInput<TLocale extends string>(
	rules: ScreeningRules,
	input: AskInput<TLocale>,
	invalidInput: RefusalReason = "out_of_scope",
	keep: ReadonlyArray<string> = [],
): Promise<{ input: AskInput<TLocale> } | { reason: RefusalReason }> {
	const question = await screenText(rules, input.question, "user", true);
	if ("reason" in question) return question;
	if (question.text.trim().length === 0) return { reason: invalidInput };
	const history: Array<HistoryTurn> = [];
	for (const turn of input.history ?? []) {
		// The guide's own published numbers (the profile's facts) are not the visitor's data: they
		// pass through, or the model would copy the "[TELEFON]" marker into its next answer.
		const masked = turn.role === "guide" ? mask(turn.text, keep) : turn.text;
		const screened = await screenText(
			rules,
			masked,
			turn.role === "guide" ? "assistant" : "user",
			false,
		);
		if ("reason" in screened) return screened;
		const text = turn.role === "guide" ? unmask(screened.text, keep) : screened.text;
		if (text.trim().length > 0) history.push({ role: turn.role, text });
	}
	return {
		input: {
			...input,
			question: question.text,
			...(input.history === undefined ? {} : { history }),
		},
	};
}
