import type { MastraModelConfig } from "@mastra/core/llm";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

/**
 * The default model, chosen by the owner (2026-11-11): `xiaomi/mimo-v2.6-flash` on OpenRouter
 * (checked against https://openrouter.ai/api/v1/models: 1M context, tool calling, $0.14 / $0.28 per
 * million input / output tokens). Override with `PSI_GUIDE_MODEL` or the `model` option.
 */
export const DEFAULT_MODEL = "xiaomi/mimo-v2.6-flash";

/** An OpenRouter model slug: `vendor/model`, optionally with a `:variant`. */
export const ModelIdSchema: z.ZodType<string> = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i);

/** The environment the guide reads, parsed at the boundary. Unknown keys are ignored. */
const GuideEnvSchema = z.object({
	OPENROUTER_API_KEY: z.string().trim().min(1).optional().catch(undefined),
	PSI_GUIDE_MODEL: ModelIdSchema.optional().catch(undefined),
});

export interface GuideEnv {
	apiKey: string | undefined;
	model: string | undefined;
}

/** Reads `OPENROUTER_API_KEY` and `PSI_GUIDE_MODEL`; a malformed value counts as unset. */
export function readGuideEnv(env: Readonly<Record<string, string | undefined>>): GuideEnv {
	const parsed = GuideEnvSchema.parse(env);
	return { apiKey: parsed.OPENROUTER_API_KEY, model: parsed.PSI_GUIDE_MODEL };
}

/** The AI SDK v4 language model shape Mastra's own type declarations expect. */
type MastraModelV4 = Extract<
	MastraModelConfig,
	{
		readonly specificationVersion: "v4";
		readonly provider: string;
		readonly supportedUrls: unknown;
	}
>;
type MastraStreamPart =
	Awaited<ReturnType<MastraModelV4["doStream"]>>["stream"] extends ReadableStream<infer P>
		? P
		: never;
type OpenRouterChatModel = ReturnType<ReturnType<typeof createOpenRouter>["chat"]>;
type OpenRouterStreamPart =
	Awaited<ReturnType<OpenRouterChatModel["doStream"]>>["stream"] extends ReadableStream<infer P>
		? P
		: never;

/** Reads a provider stream to its end, ignoring errors: the request behind it has been aborted. */
async function drain(reader: ReadableStreamDefaultReader<OpenRouterStreamPart>): Promise<void> {
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) return;
		}
	} catch {
		// The aborted request errors the stream; nothing is waiting for it any more.
	}
}

/**
 * The provider's stream as Mastra's types expect it. Two things are bridged:
 * - a version skew: the provider is built on `@ai-sdk/provider` 4.0.37, whose stream may carry
 *   `ping` keep-alive parts that Mastra's bundled 4.0.35 types do not know; pings carry nothing
 *   for the answer and are dropped;
 * - cancellation: the provider's stream forwards `cancel` to the HTTP body without handling the
 *   rejection that follows an aborted request (an unhandled rejection that can stop the process).
 *   A cancel is therefore never forwarded; the request is stopped by its abort signal and what is
 *   left of the stream is drained.
 */
function shielded(source: ReadableStream<OpenRouterStreamPart>): ReadableStream<MastraStreamPart> {
	const reader = source.getReader();
	return new ReadableStream<MastraStreamPart>({
		async pull(controller) {
			for (;;) {
				const next = await reader.read();
				if (next.done) {
					controller.close();
					return;
				}
				if (next.value.type === "error") {
					controller.enqueue({ type: "error", error: sanitized(next.value.error) });
					return;
				}
				if (next.value.type !== "ping") {
					controller.enqueue(next.value);
					return;
				}
			}
		},
		cancel() {
			void drain(reader);
		},
	});
}

/** A provider failure that carries nothing of the request or the response, only its kind. */
export class ProviderError extends Error {
	constructor(kind: string, status: number | undefined) {
		super(status === undefined ? kind : `${kind} (HTTP ${status})`);
		this.name = "ProviderError";
	}
}

/**
 * The provider's errors carry the request body (the visitor's question, the passages) and the
 * response body, and Mastra prints errors to the console, including from the internal agents of
 * its guardrail processors, which the guide cannot silence. Every error leaving the model is
 * therefore replaced by one that names only its kind and HTTP status. Aborts pass through as they
 * are: they carry nothing, and Mastra recognises them by name.
 */
function sanitized(error: unknown): Error {
	if (error instanceof Error && error.name === "AbortError") return error;
	const status =
		typeof error === "object" &&
		error !== null &&
		"statusCode" in error &&
		typeof error.statusCode === "number"
			? error.statusCode
			: undefined;
	return new ProviderError(error instanceof Error ? error.name : "unknown error", status);
}

function forMastra(model: OpenRouterChatModel): MastraModelV4 {
	return {
		specificationVersion: "v4",
		provider: model.provider,
		modelId: model.modelId,
		supportedUrls: model.supportedUrls,
		doGenerate: async (options) => {
			try {
				return await model.doGenerate(options);
			} catch (error) {
				throw sanitized(error);
			}
		},
		doStream: async (options) => {
			try {
				const result = await model.doStream(options);
				return { ...result, stream: shielded(result.stream) };
			} catch (error) {
				throw sanitized(error);
			}
		},
	};
}

export interface ModelOptions {
	apiKey: string;
	modelId: string;
	/** Points the provider somewhere other than OpenRouter (a proxy, or a test double). */
	baseURL?: string;
}

/**
 * The OpenRouter chat model for the guide. Routing denies providers that may store or train on
 * prompts: questions can carry health details.
 */
export function openRouterModel(opts: ModelOptions): MastraModelConfig {
	const provider = createOpenRouter({
		apiKey: opts.apiKey,
		compatibility: "strict",
		...(opts.baseURL === undefined ? {} : { baseURL: opts.baseURL }),
	});
	return forMastra(provider.chat(opts.modelId, { provider: { data_collection: "deny" } }));
}
