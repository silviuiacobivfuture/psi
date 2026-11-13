import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/web";
import type { Context } from "hono";
import type { z } from "zod";

export type Stream = ServerSentEventGenerator;

/** An SSE response: Datastar patches elements and signals into the open page. */
export function sse(run: (stream: Stream) => Promise<void> | void): Response {
	return ServerSentEventGenerator.stream(run);
}

/** The signals the page sent (a GET query or a POST body), parsed at the boundary. */
export async function signalsOf<T extends z.ZodTypeAny>(
	c: Context,
	schema: T,
): Promise<z.infer<T> | null> {
	const read = await ServerSentEventGenerator.readSignals(c.req.raw);
	if (!read.success) return null;
	const parsed = schema.safeParse(read.signals);
	return parsed.success ? parsed.data : null;
}
