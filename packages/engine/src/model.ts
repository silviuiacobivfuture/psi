import type { MastraModelConfig } from "@mastra/core/llm";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

/** An OpenRouter model slug: `vendor/model`, optionally with a `:variant`. */
export const ModelIdSchema: z.ZodType<string> = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i);

const OpenRouterEnvSchema = z.object({
	OPENROUTER_API_KEY: z.string().trim().min(1).optional().catch(undefined),
});

/** Reads `OPENROUTER_API_KEY`; blank or malformed counts as unset. Never log what it returns. */
export function readOpenRouterKey(
	env: Readonly<Record<string, string | undefined>>,
): string | undefined {
	return OpenRouterEnvSchema.parse(env).OPENROUTER_API_KEY;
}

/** The AI SDK v4 language model shape Mastra's own type declarations expect. */
export type ChatModel = MastraModelV4;
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

/** What the statuses that are a configuration problem, not an outage, mean for OpenRouter. */
const STATUS_MEANING: Readonly<Record<number, string>> = {
	401: "the OpenRouter API key was rejected",
	402: "the OpenRouter key has no credits for this model",
	403: "the OpenRouter key may not use this model",
	429: "OpenRouter is rate-limiting this key",
};

/** A provider failure that carries nothing of the request or the response, only its kind. */
export class ProviderError extends Error {
	readonly status: number | undefined;

	constructor(kind: string, status: number | undefined) {
		const meaning = status === undefined ? undefined : STATUS_MEANING[status];
		const where = status === undefined ? kind : `${kind} (HTTP ${status})`;
		super(meaning === undefined ? where : `${where}: ${meaning}`);
		this.name = "ProviderError";
		this.status = status;
	}
}

/**
 * The provider's errors carry the request body (the visitor's question, the passages) and the
 * response body, and Mastra prints errors to the console, including from the internal agents of
 * its guardrail processors, which the engine cannot silence. Every error leaving the model is
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

function forMastra(
	model: OpenRouterChatModel,
	onError: ((error: ProviderError | Error) => void) | undefined,
): MastraModelV4 {
	const fail = (error: unknown): Error => {
		const clean = sanitized(error);
		onError?.(clean);
		return clean;
	};
	return {
		specificationVersion: "v4",
		provider: model.provider,
		modelId: model.modelId,
		supportedUrls: model.supportedUrls,
		doGenerate: async (options) => {
			try {
				return await model.doGenerate(options);
			} catch (error) {
				throw fail(error);
			}
		},
		doStream: async (options) => {
			try {
				const result = await model.doStream(options);
				return { ...result, stream: shielded(result.stream) };
			} catch (error) {
				throw fail(error);
			}
		},
	};
}

export interface ModelOptions {
	apiKey: string;
	modelId: string;
	/** Points the provider somewhere other than OpenRouter (a proxy, or a test double). */
	baseURL?: string;
	/**
	 * Told about every (sanitised) error the model raises. Mastra's guardrail processors swallow
	 * their model's error into a bare tripwire; this is how the engine still reports what failed.
	 */
	onError?: (error: Error) => void;
	/**
	 * OpenRouter's `provider.data_collection`. `deny` (the default) routes only to providers that
	 * do not store or train on prompts; `allow` is what `:free` models need, for development with
	 * dummy data only (the consumer decides when it is allowed).
	 */
	dataCollection?: "deny" | "allow";
	/**
	 * OpenRouter's `provider.sort`: among the providers the data policy allows, try the fastest
	 * first (`latency`, the default: a chat waits for the first token), or by `throughput` or
	 * `price`. Without a sort OpenRouter balances by price, and a slow or failing provider can hold
	 * a turn until its fallback.
	 */
	sort?: ProviderSort;
}

/** How OpenRouter orders the providers it may route to. */
export type ProviderSort = "latency" | "throughput" | "price";

/**
 * An OpenRouter chat model as Mastra takes it. Routing denies providers that may store or train
 * on prompts by default: questions can carry personal or health details.
 */
export function openRouterModel(opts: ModelOptions): ChatModel {
	const provider = createOpenRouter({
		apiKey: opts.apiKey,
		compatibility: "strict",
		...(opts.baseURL === undefined ? {} : { baseURL: opts.baseURL }),
	});
	return forMastra(
		provider.chat(opts.modelId, {
			provider: { data_collection: opts.dataCollection ?? "deny", sort: opts.sort ?? "latency" },
		}),
		opts.onError,
	);
}
