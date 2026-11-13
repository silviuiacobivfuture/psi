import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeMessage {
	id: string;
	subject: string;
	body: string;
	isRead: boolean;
	createdAt: string;
	redirect?: { url: string };
}

export interface FakeInbox {
	url: string;
	/** Per subscriber id. */
	messages: Map<string, FakeMessage[]>;
	sessions: number;
	rejectNext401: boolean;
	down: boolean;
	close(): Promise<void>;
}

/** A real local HTTP server speaking Novu's Inbox API (session by subscriber hash, then bearer). */
export async function startFakeInbox(secretKey: string, applicationId: string): Promise<FakeInbox> {
	const tokens = new Map<string, string>();
	const fake: FakeInbox = {
		url: "",
		messages: new Map(),
		sessions: 0,
		rejectNext401: false,
		down: false,
		close: () => new Promise((r) => server.close(() => r())),
	};
	const server: Server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => chunks.push(c));
		req.on("end", () => {
			const send = (status: number, body: unknown): void => {
				res.writeHead(status, { "content-type": "application/json" });
				res.end(JSON.stringify(body));
			};
			if (fake.down) return send(503, {});
			const url = new URL(req.url ?? "", "http://x");
			const text = Buffer.concat(chunks).toString("utf8");
			if (url.pathname === "/v1/inbox/session") {
				const body = JSON.parse(text) as {
					applicationIdentifier: string;
					subscriber: string;
					subscriberHash: string;
				};
				const expected = createHmac("sha256", secretKey).update(body.subscriber).digest("hex");
				if (body.applicationIdentifier !== applicationId || body.subscriberHash !== expected)
					return send(400, { message: "bad hash" });
				fake.sessions++;
				const token = `tok-${body.subscriber}-${fake.sessions}-xxxxxxxx`;
				tokens.set(token, body.subscriber);
				return send(201, { data: { token } });
			}
			const token = (req.headers.authorization ?? "").replace("Bearer ", "");
			const subscriber = tokens.get(token);
			if (subscriber === undefined || fake.rejectNext401) {
				fake.rejectNext401 = false;
				return send(401, {});
			}
			const list = fake.messages.get(subscriber) ?? [];
			if (req.method === "GET" && url.pathname === "/v1/inbox/notifications")
				return send(200, {
					data: list.slice(0, Number(url.searchParams.get("limit") ?? 10)),
					hasMore: false,
				});
			if (req.method === "GET" && url.pathname === "/v1/inbox/notifications/count")
				return send(200, { data: { count: list.filter((m) => !m.isRead).length } });
			const one = /^\/v1\/inbox\/notifications\/([^/]+)\/read$/.exec(url.pathname);
			if (req.method === "PATCH" && one) {
				const m = list.find((x) => x.id === decodeURIComponent(one[1] ?? ""));
				if (m === undefined) return send(404, {});
				m.isRead = true;
				return send(200, { data: m });
			}
			if (req.method === "POST" && url.pathname === "/v1/inbox/notifications/read") {
				for (const m of list) m.isRead = true;
				return send(200, { data: {} });
			}
			return send(404, {});
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	return fake;
}
