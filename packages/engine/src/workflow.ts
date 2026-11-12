import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { SourceSchema } from "./contract";
import type { AskInput, EngineEvent } from "./events";
import { REFUSAL_REASONS } from "./events";

/** The workflow's id in Mastra's registry (and in Studio). */
export const GROUNDED_ANSWER_WORKFLOW = "grounded-answer";

const AnswerOutputSchema = z.object({
	answer: z.string(),
	sources: z.array(SourceSchema),
	refusal: z.enum(REFUSAL_REASONS).nullable(),
	/** The event types in order, as the app would have received them. */
	events: z.array(z.string()),
});

export type GroundedAnswer = z.infer<typeof AnswerOutputSchema>;

/** Collects one streamed answer into the workflow's output. */
async function collect(events: AsyncIterable<EngineEvent>): Promise<GroundedAnswer> {
	const out: GroundedAnswer = { answer: "", sources: [], refusal: null, events: [] };
	for await (const event of events) {
		// A staged `thinking` is a progress hint, not a step of the answer.
		if (event.type === "thinking" && event.stage !== undefined) continue;
		out.events.push(event.type === "refusal" ? `refusal:${event.reason}` : event.type);
		if (event.type === "text") out.answer += event.delta;
		else if (event.type === "replace") out.answer = event.text;
		else if (event.type === "sources") out.sources = [...event.sources];
		else if (event.type === "refusal") out.refusal = event.reason;
	}
	return out;
}

/**
 * The grounded-answer flow as a Mastra workflow, so Studio (and any Mastra client) can run it:
 * one step that runs the whole streamed pipeline (screening, retrieval, the agent, the
 * per-sentence gate, the scorer) and returns what reached the visitor. The pipeline itself stays a
 * stream, because its gate decides sentence by sentence what may go out; the apps consume that
 * stream directly.
 */
function buildWorkflow(
	profiles: readonly [string, ...string[]],
	ask: (profile: string, input: AskInput) => AsyncIterable<EngineEvent>,
) {
	const answer = createStep({
		id: "answer",
		description: "Screens, retrieves, answers, gates each sentence and scores the answer",
		inputSchema: z.object({
			profile: z.enum(profiles),
			question: z.string(),
			locale: z.string(),
		}),
		outputSchema: AnswerOutputSchema,
		execute: async ({ inputData }) =>
			collect(ask(inputData.profile, { question: inputData.question, locale: inputData.locale })),
	});
	return createWorkflow({
		id: GROUNDED_ANSWER_WORKFLOW,
		description: "One grounded answer, as the visitor would receive it",
		inputSchema: z.object({
			profile: z.enum(profiles),
			question: z.string(),
			locale: z.string(),
		}),
		outputSchema: AnswerOutputSchema,
	})
		.then(answer)
		.commit();
}

/** The workflow `createEngine` registers. */
export type GroundedAnswerWorkflow = ReturnType<typeof buildWorkflow>;

/** Builds the workflow over an engine's profiles and its `ask`. */
export function createGroundedAnswerWorkflow(
	profiles: readonly [string, ...string[]],
	ask: (profile: string, input: AskInput) => AsyncIterable<EngineEvent>,
): GroundedAnswerWorkflow {
	return buildWorkflow(profiles, ask);
}
