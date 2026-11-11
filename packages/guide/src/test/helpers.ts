import { z } from "zod";
import type { GuideEvent } from "../events";
import type { FakeRequest } from "./fake-openrouter";

/** Drains an answer into an array of events. */
export async function collect(events: AsyncIterable<GuideEvent>): Promise<Array<GuideEvent>> {
	const out: Array<GuideEvent> = [];
	for await (const event of events) out.push(event);
	return out;
}

/** The event types in order, with consecutive `text` events folded into one. */
export function shape(events: ReadonlyArray<GuideEvent>): Array<string> {
	const out: Array<string> = [];
	for (const event of events) {
		const label = event.type === "refusal" ? `refusal:${event.reason}` : event.type;
		if (label === "text" && out[out.length - 1] === "text") continue;
		out.push(label);
	}
	return out;
}

/** The streamed answer text. */
export function answerText(events: ReadonlyArray<GuideEvent>): string {
	return events.map((event) => (event.type === "text" ? event.delta : "")).join("");
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
