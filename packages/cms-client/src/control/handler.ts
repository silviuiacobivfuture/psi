import type { z } from "zod";
import type { Site } from "../ai-settings";
import {
	type AccountHit,
	AccountRef,
	AccountSearch,
	type AgentInfo,
	type EraseResult,
	type IngestRequest,
	IngestRequest as IngestRequestSchema,
	type IngestResult,
	type PersonView,
	type PushStats,
	PushTestRequest,
	type PushTestResult,
	type SiteStatus,
	type TestAnswerLine,
	TestQuestion,
} from "./contract";
import { CONTROL_PREFIX, verifyControl } from "./signing";

/**
 * What a site plugs into its control routes. Every part but `status` is optional: a site without
 * a guide, push or accounts answers that route 501 `not_configured`, and the control plane shows
 * the section as not configured instead of failing.
 */
export interface ControlPorts {
	brand: Site;
	status(): Promise<SiteStatus>;
	guide?: {
		agent(): Promise<AgentInfo>;
		ingest(request: IngestRequest, actor: string): Promise<IngestResult>;
		ask(question: z.infer<typeof TestQuestion>): AsyncIterable<TestAnswerLine>;
	};
	push?: {
		stats(): Promise<PushStats>;
		test(subject: string): Promise<PushTestResult>;
	};
	accounts?: {
		search(email: string): Promise<AccountHit[]>;
		person(subject: string): Promise<PersonView | null>;
		/** The person's full export (their own words included), for the officer to hand over. */
		export(subject: string): Promise<Record<string, unknown> | null>;
		erase(subject: string): Promise<EraseResult>;
	};
	/** One line per staff call (route and actor; never a body), for the site's log. */
	onAudit?: (entry: { actor: string; route: string; status: number }) => void;
}

const NO_STORE = { "cache-control": "private, no-store" } as const;
const json = (body: unknown, status = 200): Response =>
	Response.json(body, { status, headers: NO_STORE });
const notConfigured = (): Response => json({ error: "not_configured" }, 501);

function parsed<S extends z.ZodTypeAny>(schema: S, body: string): z.infer<S> | null {
	try {
		const r = schema.safeParse(JSON.parse(body));
		return r.success ? r.data : null;
	} catch {
		return null;
	}
}

function ndjson(lines: AsyncIterable<TestAnswerLine>): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const line of lines)
					controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
			} catch {
				controller.enqueue(
					encoder.encode(`${JSON.stringify({ type: "refusal", reason: "error" })}\n`),
				);
			}
			controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done" })}\n`));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { ...NO_STORE, "content-type": "application/x-ndjson; charset=utf-8" },
	});
}

async function route(
	method: string,
	path: string,
	body: string,
	actor: string,
	p: ControlPorts,
): Promise<Response> {
	const key = `${method} ${path.slice(CONTROL_PREFIX.length)}`;
	switch (key) {
		case "GET /status":
			return json(await p.status());
		case "GET /guide":
			return p.guide === undefined ? notConfigured() : json(await p.guide.agent());
		case "POST /guide/ingest": {
			if (p.guide === undefined) return notConfigured();
			const r = parsed(IngestRequestSchema, body);
			return r === null ? json({ error: "invalid" }, 400) : json(await p.guide.ingest(r, actor));
		}
		case "POST /guide/ask": {
			if (p.guide === undefined) return notConfigured();
			const q = parsed(TestQuestion, body);
			return q === null ? json({ error: "invalid" }, 400) : ndjson(p.guide.ask(q));
		}
		case "GET /push":
			return p.push === undefined ? notConfigured() : json(await p.push.stats());
		case "POST /push/test": {
			if (p.push === undefined) return notConfigured();
			const r = parsed(PushTestRequest, body);
			return r === null ? json({ error: "invalid" }, 400) : json(await p.push.test(r.subject));
		}
		case "POST /accounts/search": {
			if (p.accounts === undefined) return notConfigured();
			const r = parsed(AccountSearch, body);
			return r === null
				? json({ error: "invalid" }, 400)
				: json({ accounts: await p.accounts.search(r.email) });
		}
		case "POST /accounts/person":
		case "POST /accounts/export":
		case "POST /accounts/erase": {
			if (p.accounts === undefined) return notConfigured();
			const r = parsed(AccountRef, body);
			if (r === null) return json({ error: "invalid" }, 400);
			if (key.endsWith("/erase")) return json(await p.accounts.erase(r.subject));
			const found = key.endsWith("/person")
				? await p.accounts.person(r.subject)
				: await p.accounts.export(r.subject);
			return found === null ? json({ error: "not_found" }, 404) : json(found);
		}
		default:
			return json({ error: "unknown" }, 404);
	}
}

/**
 * The site's control routes (`/__control/*`), framework-agnostic (Hono: `c.req.raw`): 503 without
 * the secret, 401 on a bad or stale signature, then the route. A port that throws answers 500
 * with no detail (the site logs it).
 */
export async function handleControl(
	request: Request,
	secret: string | null | undefined,
	ports: ControlPorts,
	now: () => number = Date.now,
): Promise<Response> {
	const v = await verifyControl(request, secret, now);
	if (!v.ok) return new Response(null, { status: v.status, headers: NO_STORE });
	let res: Response;
	try {
		res = await route(request.method.toUpperCase(), v.path, v.body, v.actor, ports);
	} catch (err) {
		console.error(`control: ${v.path} failed: ${err instanceof Error ? err.message : String(err)}`);
		res = json({ error: "failed" }, 500);
	}
	ports.onAudit?.({ actor: v.actor, route: v.path, status: res.status });
	return res;
}
