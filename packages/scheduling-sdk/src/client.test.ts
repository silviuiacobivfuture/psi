import { describe, expect, it } from "vitest";
import { createSchedulingClient, SchedulingApiError, SchedulingTransportError } from "./index";

type Handler = (req: Request) => Response | Promise<Response>;
const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const clientOn = (
	handler: Handler,
	auth: Parameters<typeof createSchedulingClient>[0]["auth"] = { bearer: "tok" },
	timeoutMs = 500,
) =>
	createSchedulingClient({
		baseUrl: "https://api.test/",
		auth,
		timeoutMs,
		fetch: async (input, init) => handler(new Request(input, init)),
	});

const client = {
	id: "cli-0001",
	name: "Ana",
	status: "active",
	treating: [],
	createdAt: 1,
	updatedAt: 2,
};

describe("the derived client", () => {
	it("flattens the input into the path, the query and the body", async () => {
		let seen: Request | undefined;
		const c = clientOn((req) => {
			seen = req;
			return json({ items: [client], total: 1, offset: 0 });
		});
		const out = await c.clients.list({ app: "psizone", status: "archived", q: "an" });
		expect(out.items[0]?.name).toBe("Ana");
		expect(seen?.url).toBe("https://api.test/v1/apps/psizone/clients?status=archived&q=an");
		expect(seen?.headers.get("authorization")).toBe("Bearer tok");
		// In-cluster, server to server: the answers come uncompressed (compressing costs more CPU than it saves).
		expect(seen?.headers.get("accept-encoding")).toBe("identity");
	});

	it("sends the body of a mutation as JSON and parses the answer", async () => {
		let body: unknown;
		const c = clientOn(async (req) => {
			body = await req.json();
			return json(client);
		});
		await c.clients.update({ app: "psizone", id: "cli-0001", name: "Ana B" });
		expect(body).toEqual({ name: "Ana B" });
	});

	it("takes a function for the bearer, called per request", async () => {
		let n = 0;
		const seen: string[] = [];
		const c = clientOn(
			(req) => {
				seen.push(req.headers.get("authorization") ?? "");
				return json({ status: "ok" });
			},
			{ bearer: () => `t${++n}` },
		);
		await c.meta.health({});
		await c.meta.health({});
		expect(seen).toEqual(["Bearer t1", "Bearer t2"]);
	});

	it("sends a service key and the visitor's subject, and no bearer", async () => {
		let seen: Request | undefined;
		const c = clientOn(
			(req) => {
				seen = req;
				return json({ items: [] });
			},
			{ serviceKey: "k.s", subject: "u1" },
		);
		await c.visitor.mine({ app: "psizone" });
		expect(seen?.headers.get("x-service-key")).toBe("k.s");
		expect(seen?.headers.get("x-psi-subject")).toBe("u1");
		expect(seen?.headers.get("authorization")).toBeNull();
		expect(seen?.headers.get("x-psi-client-ip")).toBeNull();
	});

	it("forwards the visitor's address for the service's rate limit when given", async () => {
		let seen: Request | undefined;
		const c = clientOn(
			(req) => {
				seen = req;
				return json({ timeZone: "Europe/Bucharest", services: [] });
			},
			{ serviceKey: "k.s", clientIp: "203.0.113.7" },
		);
		await c.visitor.services({ app: "psizone" });
		expect(seen?.headers.get("x-psi-client-ip")).toBe("203.0.113.7");
		expect(seen?.headers.get("x-psi-subject")).toBeNull();
	});

	it("throws a typed error with the code, status and request id on a refusal", async () => {
		const c = clientOn(() =>
			json({ error: { code: "forbidden", message: "no", requestId: "r-1" } }, 403),
		);
		const error = await c.clients.list({ app: "psizone" }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SchedulingApiError);
		expect(error).toMatchObject({ code: "forbidden", status: 403, requestId: "r-1" });
	});

	it("refuses an answer that does not match the contract", async () => {
		const c = clientOn(() => json({ items: [{ id: "x" }] }));
		await expect(c.clients.list({ app: "psizone" })).rejects.toMatchObject({
			reason: "bad_response",
		});
	});

	it("refuses an error body that is not the contract's", async () => {
		const c = clientOn(() => new Response("<html>", { status: 502 }));
		await expect(c.clients.list({ app: "psizone" })).rejects.toBeInstanceOf(
			SchedulingTransportError,
		);
	});

	it("reports an unreachable service and a deadline", async () => {
		const down = createSchedulingClient({
			baseUrl: "https://x.test",
			auth: { bearer: "t" },
			fetch: () => Promise.reject(new TypeError("fetch failed")),
		});
		await expect(down.meta.health({})).rejects.toMatchObject({ reason: "unreachable" });
		const slow = clientOn(() => new Promise<Response>(() => undefined), { bearer: "t" }, 30);
		const hung = createSchedulingClient({
			baseUrl: "https://x.test",
			auth: { bearer: "t" },
			timeoutMs: 30,
			fetch: (_i, init) =>
				new Promise((_r, rej) =>
					init?.signal?.addEventListener("abort", () => rej(init.signal?.reason)),
				),
		});
		await expect(hung.meta.health({})).rejects.toMatchObject({ reason: "timeout" });
		expect(slow).toBeDefined();
	});

	it("streams the calendar's events, parsed, skipping heartbeats", async () => {
		const events = [
			{ seq: 1, at: 1, kind: "appointment", op: "created", id: "a" },
			{ seq: 2, at: 2, kind: "client", op: "updated", id: "b" },
		];
		const body = `: hb\n\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}`;
		const c = clientOn(
			() => new Response(body, { headers: { "content-type": "text/event-stream" } }),
		);
		const got: unknown[] = [];
		for await (const e of c.calendar.stream({ app: "psizone", after: 0 })) got.push(e);
		expect(got).toEqual(events);
	});

	it("deletes a file with the confirmation in the query and no body", async () => {
		const seen: { method: string; url: string; body: unknown }[] = [];
		const c = clientOn(async (req) => {
			seen.push({ method: req.method, url: req.url, body: await req.text() });
			return json({ ok: true });
		});
		await c.files.remove({ app: "psizone", id: "file-0001", confirm: "true" });
		expect(seen[0]).toEqual({
			method: "DELETE",
			url: "https://api.test/v1/apps/psizone/files/file-0001?confirm=true",
			body: "",
		});
	});

	it("refuses a stream event that does not match the contract", async () => {
		const c = clientOn(() => new Response('data: {"seq":"x"}\n\n'));
		await expect(
			(async () => {
				for await (const _ of c.calendar.stream({ app: "psizone" })) {
					/* drain */
				}
			})(),
		).rejects.toMatchObject({ reason: "bad_response" });
	});
});
