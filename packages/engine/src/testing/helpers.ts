import { z } from "zod";
import type { EngineEvent } from "../events";
import type { FakeRequest } from "./fake-openrouter";

/** Drains an answer into an array of events. */
export async function collect(events: AsyncIterable<EngineEvent>): Promise<Array<EngineEvent>> {
	const out: Array<EngineEvent> = [];
	for await (const event of events) out.push(event);
	return out;
}

/**
 * The event types in order, with consecutive `text` events folded into one. A `thinking` with a
 * `stage` (a progress hint while a tool runs or a reply is regenerated) is left out; see `stages`.
 */
export function shape(events: ReadonlyArray<EngineEvent>): Array<string> {
	const out: Array<string> = [];
	for (const event of events) {
		if (event.type === "thinking" && event.stage !== undefined) continue;
		const label = event.type === "refusal" ? `refusal:${event.reason}` : event.type;
		if (label === "text" && out[out.length - 1] === "text") continue;
		out.push(label);
	}
	return out;
}

/** The progress stages the turn announced, in order. */
export function stages(events: ReadonlyArray<EngineEvent>): Array<string> {
	return events.flatMap((e) => (e.type === "thinking" && e.stage !== undefined ? [e.stage] : []));
}

/** The answer text as the visitor ends up seeing it: `text` appends, `replace` resets. */
export function answerText(events: ReadonlyArray<EngineEvent>): string {
	let text = "";
	for (const event of events) {
		if (event.type === "text") text += event.delta;
		else if (event.type === "replace") text = event.text;
	}
	return text;
}

const ContentSchema = z.union([z.string(), z.array(z.object({ text: z.string() })), z.null()]);

const ChatBodySchema = z.object({
	model: z.string(),
	messages: z.array(z.object({ role: z.string(), content: ContentSchema.optional() })),
	provider: z.object({ data_collection: z.string() }).optional(),
	tool_choice: z.unknown().optional(),
	tools: z.array(z.object({ function: z.object({ name: z.string() }) })).optional(),
});

export type ChatBody = z.infer<typeof ChatBodySchema>;

/** Parses what the provider sent to the fake OpenRouter. */
export function chatBody(request: FakeRequest | undefined): ChatBody {
	return ChatBodySchema.parse(request?.body);
}

/** One message's text, whatever its content shape. */
export function messageText(content: z.infer<typeof ContentSchema> | undefined): string {
	if (content === null || content === undefined) return "";
	return typeof content === "string" ? content : content.map((part) => part.text).join("");
}

/** Every system message the answering model was sent, joined. */
export function systemText(request: FakeRequest | undefined): string {
	return chatBody(request)
		.messages.filter((m) => m.role === "system")
		.map((m) => messageText(m.content))
		.join("\n");
}
