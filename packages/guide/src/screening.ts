import { type MastraDBMessage, MessageList, TripWire } from "@mastra/core/agent";
import { noopLogger } from "@mastra/core/logger";
import {
	type ProcessInputArgs,
	type Processor,
	ProcessorRunner,
	UnicodeNormalizer,
} from "@mastra/core/processors";
import type { AskInput, HistoryTurn, RefusalReason } from "./events";
import { isAbusive } from "./guardrails/abuse";
import { isInjection } from "./guardrails/injection";
import { piiRedactor } from "./guardrails/pii";
import { LookalikeFolder } from "./guardrails/unicode";

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

const INJECTION_RULES = "psi-injection-rules";
const ABUSE_RULES = "psi-abuse-rules";

/** The refusal each aborting step of the chain stands for. */
const REFUSAL_BY_PROCESSOR: Readonly<Record<string, RefusalReason>> = {
	[INJECTION_RULES]: "injection",
	[ABUSE_RULES]: "abuse",
};

/**
 * The deterministic chain, cheapest and most certain first; none of it calls a model:
 * 1. Mastra `UnicodeNormalizer`: NFKC, control characters, whitespace.
 * 2. `LookalikeFolder`: invisible characters and Cyrillic or Greek look-alike letters.
 * 3. Injection rules (`injection`), on the question and on every history turn: forged history is
 *    an injection route too.
 * 4. Abuse rules (`abuse`), on the question only: a refused question an app kept in its history
 *    must not refuse every later one.
 * 5. Mastra `RegexFilterProcessor`, redacting identifiers (Mastra's `pii` preset and the
 *    Romanian phone, CNP and IBAN rules) before search, the model and memory.
 */
function chain(isQuestion: boolean): ProcessorRunner {
	const steps: Array<Processor> = [
		new UnicodeNormalizer({ stripControlChars: true, collapseWhitespace: true, trim: true }),
		new LookalikeFolder(),
		new RuleProcessor(INJECTION_RULES, "Injection rules", isInjection),
		...(isQuestion ? [new RuleProcessor(ABUSE_RULES, "Abuse rules", isAbusive)] : []),
		piiRedactor(),
	];
	return new ProcessorRunner({
		inputProcessors: steps,
		logger: noopLogger,
		agentName: "psi-guide-screening",
	});
}

type Screened = { text: string } | { reason: RefusalReason };

/** Screens one message with a fresh runner, so no processor state is shared between asks. */
async function screenText(
	text: string,
	role: "user" | "assistant",
	isQuestion: boolean,
): Promise<Screened> {
	const runner = chain(isQuestion);
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

/**
 * Runs the deterministic chain over the question and the history. Returns the input as the model
 * may see it (cleaned and redacted), or the refusal a rule matched. A question that is empty once
 * cleaned is `out_of_scope`, like any other question the guide cannot take as asked. Throws only
 * on a failure of the chain itself, which the caller turns into `unavailable`.
 */
export async function screenInput(
	input: AskInput,
): Promise<{ input: AskInput } | { reason: RefusalReason }> {
	const question = await screenText(input.question, "user", true);
	if ("reason" in question) return question;
	if (question.text.trim().length === 0) return { reason: "out_of_scope" };
	const history: Array<HistoryTurn> = [];
	for (const turn of input.history ?? []) {
		const screened = await screenText(
			turn.text,
			turn.role === "guide" ? "assistant" : "user",
			false,
		);
		if ("reason" in screened) return screened;
		if (screened.text.trim().length > 0) history.push({ role: turn.role, text: screened.text });
	}
	return {
		input: {
			...input,
			question: question.text,
			...(input.history === undefined ? {} : { history }),
		},
	};
}
