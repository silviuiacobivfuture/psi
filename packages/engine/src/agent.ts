import { Agent, type ToolsInput } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { noopLogger } from "@mastra/core/logger";
import { TokenLimiterProcessor } from "@mastra/core/processors";
import type { RequestContext } from "@mastra/core/request-context";
import type { Memory } from "@mastra/memory";
import { z } from "zod";

/**
 * The most prompt tokens one model call may carry (instructions, passages, history). Mastra's
 * `TokenLimiterProcessor` drops the oldest history to fit; history alone is bounded by
 * `MAX_HISTORY_TURNS` and memory's window, so this caps what a long conversation costs.
 */
export const MAX_PROMPT_TOKENS = 12_000;

/** The request-context key a turn names its answering model under (the owner's choice). */
export const MODEL_KEY = "engine.model";

const ModelSlug = z.string().min(1);

/**
 * The model one call answers with: the slug the turn put in its request context, else the
 * engine's default (Studio, warm-up and operations calls carry no turn).
 */
export function turnModel(
	modelFor: (slug: string) => MastraModelConfig,
	fallback: string,
): (ctx: { requestContext: RequestContext }) => MastraModelConfig {
	return ({ requestContext }) => {
		const asked = ModelSlug.safeParse(requestContext.get(MODEL_KEY));
		return modelFor(asked.success ? asked.data : fallback);
	};
}

export interface ProfileAgentOptions {
	id: string;
	name: string;
	/** The default instructions; each answer replaces them with the asked locale's. */
	instructions: string;
	/** A model, or one chosen per call from the request context (see `turnModel`). */
	model: MastraModelConfig | ((ctx: { requestContext: RequestContext }) => MastraModelConfig);
	/** Given only to the agent that serves threads; the other one can never store anything. */
	memory?: Memory;
	/**
	 * The agent's tools: fixed (the scheduling agent's), or hydrated per call from the request
	 * context (the grounded-answer agent's catalog tools, see `grounding/agent-tools.ts`).
	 */
	tools?: ToolsInput | ((ctx: { requestContext: RequestContext }) => Promise<ToolsInput>);
}

/**
 * One profile's Mastra agent. Its tools are hydrated per call and find the answer's ledger in the
 * request context. Provider retries and Mastra's default error processors are off: the engine fails fast
 * to `unavailable` rather than waiting through backoff. The agent's logger is silenced: Mastra
 * logs failed requests with their bodies, which carry visitors' questions; failures reach the app
 * through `onFailure`. The only input processor is the token limit; the guardrails run before the
 * agent (see `ask`).
 */
export function createProfileAgent(opts: ProfileAgentOptions): Agent {
	const agent = new Agent({
		id: opts.id,
		name: opts.name,
		instructions: opts.instructions,
		model: opts.model,
		maxRetries: 0,
		errorProcessorDefaults: false,
		inputProcessors: [new TokenLimiterProcessor({ limit: MAX_PROMPT_TOKENS })],
		...(opts.memory === undefined ? {} : { memory: opts.memory }),
		...(opts.tools === undefined ? {} : { tools: opts.tools }),
	});
	agent.__setLogger(noopLogger);
	return agent;
}
