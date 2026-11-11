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

export interface FakeOpenRouter {
	baseURL: string;
	requests: ReadonlyArray<FakeRequest>;
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

/** Starts the fake; each request gets the next scripted reply (the last one repeats). */
export async function startFakeOpenRouter(
	script: ReadonlyArray<FakeReply>,
): Promise<FakeOpenRouter> {
	const requests: Array<FakeRequest> = [];
	const open = new Set<ServerResponse>();
	let cut = 0;
	const server = createServer((req, res) => {
		open.add(res);
		res.on("close", () => {
			open.delete(res);
			if (!res.writableFinished) cut += 1;
		});
		void readBody(req).then((body) => {
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
		cutOff: () => cut,
		close: () =>
			new Promise<void>((resolve) => {
				for (const res of open) res.destroy();
				server.close(() => resolve());
			}),
	};
}
