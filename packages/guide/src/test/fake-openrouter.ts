import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/**
 * A stand-in for the OpenRouter HTTP API (`POST /chat/completions`, OpenAI-style SSE), so tests
 * exercise the real provider, Mastra and our code, with only the external service replaced.
 */
export type FakeReply =
	| { kind: "text"; chunks: ReadonlyArray<string>; delayMs?: number; finish?: string }
	| { kind: "tool"; query: string }
	| { kind: "status"; status: number }
	| { kind: "hang" };

export interface FakeRequest {
	path: string;
	body: unknown;
}

/** Which of Mastra's guardrail processors sent a (non-streaming) screening request. */
export type ScreenKind = "injection" | "moderation";

/**
 * How the fake answers one guardrail: a clean or flagged verdict, a 200 whose text is not a verdict
 * (`garbage`), an HTTP failure, or no answer at all.
 */
export type ScreenReply =
	| { kind: "clean" }
	| { kind: "garbage" }
	| { kind: "flag" }
	| { kind: "status"; status: number }
	| { kind: "hang" };

export type ScreenScript = Partial<Record<ScreenKind, ScreenReply>>;

export interface FakeOpenRouter {
	baseURL: string;
	/** The streaming answer requests (the guide's agent). */
	requests: ReadonlyArray<FakeRequest>;
	/** The non-streaming guardrail requests, by the processor that sent them. */
	screenings: ReadonlyArray<FakeRequest & { kind: ScreenKind }>;
	/** Responses the client hung up on before they were complete. */
	cutOff(): number;
	close(): Promise<void>;
}

function sse(res: ServerResponse, payload: object): void {
	res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function chunk(delta: object, finishReason: string | null = null): object {
	return {
		id: "gen-fake",
		model: "fake",
		choices: [{ index: 0, delta, finish_reason: finishReason }],
	};
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function reply(res: ServerResponse, answer: FakeReply, n: number): Promise<void> {
	if (answer.kind === "hang") return;
	if (answer.kind === "status") {
		res.writeHead(answer.status, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: { message: "upstream failed", code: answer.status } }));
		return;
	}
	res.writeHead(200, { "content-type": "text/event-stream" });
	if (answer.kind === "tool") {
		sse(
			res,
			chunk({
				role: "assistant",
				tool_calls: [
					{
						index: 0,
						id: `call-${n}`,
						type: "function",
						function: {
							name: "searchKnowledge",
							arguments: JSON.stringify({ query: answer.query }),
						},
					},
				],
			}),
		);
		sse(res, chunk({}, "tool_calls"));
	} else {
		for (const [i, content] of answer.chunks.entries()) {
			if (i > 0 && answer.delayMs !== undefined) await pause(answer.delayMs);
			if (res.destroyed) return;
			sse(res, chunk(i === 0 ? { role: "assistant", content } : { content }));
		}
		sse(res, chunk({}, answer.finish ?? "stop"));
	}
	res.end("data: [DONE]\n\n");
}

/** The verdict JSON each guardrail's structured output expects. */
const VERDICTS: Readonly<Record<ScreenKind, Record<"clean" | "flag", object>>> = {
	injection: {
		clean: { categories: [], reason: null },
		flag: { categories: [{ type: "injection", score: 0.95 }], reason: "override attempt" },
	},
	moderation: {
		clean: { category_scores: [], reason: null },
		flag: { category_scores: [{ category: "harassment", score: 0.95 }], reason: "insult" },
	},
};

function isStreaming(body: unknown): boolean {
	return typeof body === "object" && body !== null && "stream" in body && body.stream === true;
}

function screenKind(body: unknown): ScreenKind {
	return JSON.stringify(body).includes("prompt injection") ? "injection" : "moderation";
}

function replyScreen(res: ServerResponse, kind: ScreenKind, answer: ScreenReply): void {
	if (answer.kind === "hang") return;
	if (answer.kind === "status") {
		res.writeHead(answer.status, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: { message: "upstream failed", code: answer.status } }));
		return;
	}
	res.writeHead(200, { "content-type": "application/json" });
	res.end(
		JSON.stringify({
			id: "gen-screen",
			model: "fake",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content:
							answer.kind === "garbage"
								? "I cannot help with that."
								: JSON.stringify(VERDICTS[kind][answer.kind]),
					},
					finish_reason: "stop",
				},
			],
			usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
		}),
	);
}

function readBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve) => {
		let raw = "";
		req.on("data", (part: Buffer) => {
			raw += part.toString("utf8");
		});
		req.on("end", () => {
			try {
				const parsed: unknown = JSON.parse(raw);
				resolve(parsed);
			} catch {
				resolve(raw);
			}
		});
	});
}

/**
 * Starts the fake; each answer request gets the next scripted reply (the last one repeats). Guardrail
 * requests (non-streaming) are answered from `screen`, clean by default, and recorded apart.
 */
export async function startFakeOpenRouter(
	script: ReadonlyArray<FakeReply>,
	screen: ScreenScript = {},
): Promise<FakeOpenRouter> {
	const requests: Array<FakeRequest> = [];
	const screenings: Array<FakeRequest & { kind: ScreenKind }> = [];
	const open = new Set<ServerResponse>();
	let cut = 0;
	const server = createServer((req, res) => {
		open.add(res);
		res.on("close", () => {
			open.delete(res);
			if (!res.writableFinished) cut += 1;
		});
		void readBody(req).then((body) => {
			if (!isStreaming(body)) {
				const kind = screenKind(body);
				screenings.push({ path: req.url ?? "", body, kind });
				replyScreen(res, kind, screen[kind] ?? { kind: "clean" });
				return;
			}
			requests.push({ path: req.url ?? "", body });
			const answer = script[Math.min(requests.length, script.length) - 1] ?? {
				kind: "status",
				status: 500,
			};
			void reply(res, answer, requests.length);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port = typeof address === "object" && address !== null ? address.port : 0;
	return {
		baseURL: `http://127.0.0.1:${port}/api/v1`,
		requests,
		screenings,
		cutOff: () => cut,
		close: () =>
			new Promise<void>((resolve) => {
				for (const res of open) res.destroy();
				server.close(() => resolve());
			}),
	};
}
