import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { type EngineKnowledge, type Passage, PassageSchema } from "./contract";
import { TOP_K } from "./grounding/knowledge-tool";
import type { Profile } from "./profile";

/** The registered tool's id (Studio's Tools page, `mastra.getTool`). */
export const KNOWLEDGE_TOOL = "searchKnowledge";

const OutputSchema = z.object({ passages: z.array(PassageSchema).readonly() });

function buildTool(profiles: ReadonlyArray<Profile>, knowledge: EngineKnowledge) {
	const ids = profiles.map((profile) => profile.id);
	const [first, ...rest] = ids;
	return createTool({
		id: KNOWLEDGE_TOOL,
		description:
			"Search one profile's reviewed content in one locale, as the grounded-answer flow does. Returns the passages with their sources and scores.",
		inputSchema: z.object({
			profile: z.enum([first ?? "", ...rest]),
			locale: z.string(),
			query: z.string().trim().min(1).max(300),
		}),
		outputSchema: OutputSchema,
		execute: async ({ profile, locale, query }): Promise<{ passages: ReadonlyArray<Passage> }> => {
			const scope = profiles.find((p) => p.id === profile)?.knowledgeScope ?? profile;
			const found = await knowledge.search({ query, scope, locale, topK: TOP_K });
			return OutputSchema.parse({ passages: found });
		},
	});
}

/** The retrieval tool the engine registers with Mastra, for Studio and other Mastra clients. */
export type KnowledgeTool = ReturnType<typeof buildTool>;

/**
 * `searchKnowledge` over the engine's knowledge, for a person exploring the content: it takes the
 * profile and the locale as input. The answers never use it; each answer binds its own
 * `searchKnowledge` to its ledger, so every passage the model sees can be cited and checked.
 */
export function createKnowledgeTool(
	profiles: ReadonlyArray<Profile>,
	knowledge: EngineKnowledge,
): KnowledgeTool {
	return buildTool(profiles, knowledge);
}
