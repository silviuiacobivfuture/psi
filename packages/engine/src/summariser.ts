import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { RequestContext } from "@mastra/core/request-context";
import { MODEL_KEY, turnModel } from "./agent";
import { SUMMARY_INSTRUCTIONS, SUMMARY_TOKENS, type Summariser } from "./compaction";
import { usageOf } from "./usage";

/**
 * The summariser both assistants fold a long conversation with: one streamed call to the organisation's summary model
 * (`model.summary`, a cheap one) through its own agent, which has no tools and no memory, at temperature 0. What it
 * used is read as a turn's is, for the meters.
 */
export function agentSummariser(modelFor: (slug: string) => MastraModelConfig): Summariser {
	const agent = new Agent({
		id: "conversation-summary",
		name: "Conversation summary",
		instructions: SUMMARY_INSTRUCTIONS,
		model: turnModel(modelFor, "unset/summary"),
	});
	return async ({ model, transcript, signal }) => {
		const output = await agent.stream([{ role: "user", content: transcript }], {
			requestContext: new RequestContext<unknown>([[MODEL_KEY, model]]),
			maxSteps: 1,
			abortSignal: signal,
			modelSettings: { maxRetries: 0, maxOutputTokens: SUMMARY_TOKENS, temperature: 0 },
		});
		const text = (await output.text).trim();
		if (text === "") throw new Error("empty summary");
		return { text, usage: { ...(await usageOf(output, signal)), limitHit: false } };
	};
}
