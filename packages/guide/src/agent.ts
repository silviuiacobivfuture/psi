import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { noopLogger } from "@mastra/core/logger";
import { TokenLimiterProcessor } from "@mastra/core/processors";
import type { Memory } from "@mastra/memory";
import type { Brand } from "./contract";
import { instructionsFor } from "./prompts/instructions";

const NAMES: Readonly<Record<Brand, string>> = {
	psizone: "Ghidul Psizone",
	eqsync: "Ghidul EQ-SYNC",
	hemisync: "Ghidul Hemi-Sync",
	blog: "Ghidul blogului psi",
};

/**
 * The most prompt tokens one model call may carry (instructions, passages, history). Mastra's
 * `TokenLimiterProcessor` drops the oldest history to fit; history alone is bounded by
 * `MAX_HISTORY_TURNS` and memory's window, so this caps what a long conversation costs.
 */
export const MAX_PROMPT_TOKENS = 12_000;

export interface BrandAgentOptions {
	brand: Brand;
	model: MastraModelConfig;
	/** Given only to the agent that serves threads; the other one can never store anything. */
	memory?: Memory;
}

/**
 * The brand's Mastra agent. Instructions default to Romanian and are replaced per call with the
 * asked locale. Tools are supplied per call (they are bound to that answer's ledger). Provider
 * retries and Mastra's default error processors are off: the guide fails fast to `unavailable`
 * rather than waiting through backoff. Mastra's own logger is silenced: it logs failed requests
 * with their bodies, which carry visitors' questions; failures reach the app through `onFailure`.
 * The only input processor is the token limit; the guardrails run before the agent (see `ask`).
 */
export function createBrandAgent(opts: BrandAgentOptions): Agent {
	const agent = new Agent({
		id: `psi-guide-${opts.brand}${opts.memory === undefined ? "" : "-threads"}`,
		name: NAMES[opts.brand],
		instructions: instructionsFor(opts.brand, "ro"),
		model: opts.model,
		maxRetries: 0,
		errorProcessorDefaults: false,
		inputProcessors: [new TokenLimiterProcessor({ limit: MAX_PROMPT_TOKENS })],
		...(opts.memory === undefined ? {} : { memory: opts.memory }),
	});
	agent.__setLogger(noopLogger);
	return agent;
}
