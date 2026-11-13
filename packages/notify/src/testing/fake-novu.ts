import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface Recorded {
	method: string;
	path: string;
	headers: IncomingMessage["headers"];
	body: unknown;
}

export type Script = (
	req: Recorded,
	attempt: number,
) => { status: number; body?: unknown } | undefined;

export interface FakeNovu {
	url: string;
	requests: Recorded[];
	/** Triggers Novu actually accepted (a repeated Idempotency-Key is not accepted twice). */
	accepted: Recorded[];
	script: Script | undefined;
	close(): Promise<void>;
}

/** A real local HTTP server that speaks the slice of Novu's API @psi/notify uses. */
export async function startFakeNovu(): Promise<FakeNovu> {
	/** Novu keeps the first answer under an Idempotency-Key, a refusal too, and replays it. */
	const answers = new Map<string, { status: number; body: unknown }>();
	const fake: FakeNovu = {
		url: "",
		requests: [],
		accepted: [],
		script: undefined,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	};
	const server: Server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => chunks.push(c));
		req.on("end", () => {
			const text = Buffer.concat(chunks).toString("utf8");
			let body: unknown = null;
			try {
				body = text === "" ? null : JSON.parse(text);
			} catch {
				body = text;
			}
			const rec: Recorded = {
				method: req.method ?? "",
				path: req.url ?? "",
				headers: req.headers,
				body,
			};
			fake.requests.push(rec);
			const attempt = fake.requests.filter((r) => r.path === rec.path).length;
			const key = String(req.headers["idempotency-key"] ?? "");
			if (rec.path === "/v1/events/trigger" && key !== "") {
				const kept = answers.get(key);
				if (kept !== undefined) {
					res.writeHead(kept.status, {
						"content-type": "application/json",
						"idempotency-replay": "true",
					});
					return void res.end(JSON.stringify(kept.body));
				}
			}
			const reply = (status: number, answer: unknown): void => {
				if (rec.path === "/v1/events/trigger" && key !== "")
					answers.set(key, { status, body: answer });
				res.writeHead(status, { "content-type": "application/json" });
				res.end(JSON.stringify(answer));
			};
			const scripted = fake.script?.(rec, attempt);
			if (scripted !== undefined) return reply(scripted.status, scripted.body ?? {});
			if (rec.path === "/v1/events/trigger") {
				fake.accepted.push(rec);
				return reply(201, {
					data: { acknowledged: true, status: "processed", transactionId: "t1" },
				});
			}
			return reply(200, { data: {} });
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	return fake;
}
