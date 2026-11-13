import type { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { Memory } from "@mastra/memory";
import { createProfileAgent } from "../agent";
import { STAFF_RO } from "./copy";
import { staffInstructions } from "./prompt";
import { staffTools } from "./tools";

/** The staff agent's Mastra id. */
export const STAFF_AGENT_ID = "staff-assistant";

/**
 * The staff assistant's Mastra agent: the visitor agents' own builder (retries off, a silenced
 * logger, the token limit), with the staff tools hydrated per call from a verified session. Run
 * without one, it throws before any model is called. It is never registered with the visitor
 * engine's Mastra instance.
 */
export function createStaffAgent(opts: { model: MastraModelConfig; memory?: Memory }): Agent {
	return createProfileAgent({
		id: STAFF_AGENT_ID,
		name: "Staff assistant",
		instructions: staffInstructions(STAFF_RO),
		model: opts.model,
		tools: staffTools,
		...(opts.memory === undefined ? {} : { memory: opts.memory }),
	});
}
