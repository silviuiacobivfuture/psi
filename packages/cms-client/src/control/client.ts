import { z } from "zod";
import {
	type AccountHit,
	AccountHits,
	AgentInfo,
	EraseResult,
	type IngestRequest,
	IngestResult,
	PersonView,
	PushStats,
	PushTestResult,
	SiteStatus,
	TestAnswerLine,
	type TestQuestion,
} from "./contract";
import { CONTROL_PREFIX, signControl } from "./signing";

/** Why a control call gave no answer: the section then says so, and nothing crashes. */
export type ControlProblem = "not_configured" | "unreachable" | "refused" | "not_found" | "invalid";
export type ControlResult<T> = { ok: true; data: T } | { ok: false; problem: ControlProblem };

export interface ControlClientOptions {
	/** The site's origin as the CMS reaches it (in-cluster in production), no trailing slash. */
	origin: string;
	secret: string;
	timeoutMs?: number;
	fetch?: typeof fetch;
}

export interface ControlClient {
	status(actor: string): Promise<ControlResult<SiteStatus>>;
	agent(actor: string): Promise<ControlResult<AgentInfo>>;
	ingest(request: IngestRequest, actor: string): Promise<ControlResult<IngestResult>>;
	/** The test answer as it streams, line by line (already parsed). */
	ask(question: TestQuestion, actor: string): Promise<ControlResult<AsyncIterable<TestAnswerLine>>>;
	push(actor: string): Promise<ControlResult<PushStats>>;
	pushTest(subject: string, actor: string): Promise<ControlResult<PushTestResult>>;
	searchAccounts(email: string, actor: string): Promise<ControlResult<AccountHit[]>>;
	person(subject: string, actor: string): Promise<ControlResult<PersonView>>;
	exportAccount(subject: string, actor: string): Promise<ControlResult<Record<string, unknown>>>;
	erase(subject: string, actor: string): Promise<ControlResult<EraseResult>>;
}

function problemOf(status: number): ControlProblem {
	if (status === 501 || status === 503) return "not_configured";
	if (status === 401 || status === 403) return "refused";
	if (status === 404) return "not_found";
	return "invalid";
}

function parseLine(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

async function* lines(body: ReadableStream<Uint8Array>): AsyncIterable<TestAnswerLine> {
	const decoder = new TextDecoder();
	let buffer = "";
	const reader = body.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let nl = buffer.indexOf("\n");
		while (nl >= 0) {
			const raw = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (raw !== "") {
				const parsed = TestAnswerLine.safeParse(parseLine(raw));
				if (parsed.success) yield parsed.data;
			}
			nl = buffer.indexOf("\n");
		}
	}
}

export function createControlClient(o: ControlClientOptions): ControlClient {
	const f = o.fetch ?? fetch;
	const timeout = o.timeoutMs ?? 5000;

	async function send(
		method: "GET" | "POST",
		route: string,
		actor: string,
		payload: unknown,
		ms = timeout,
	): Promise<Response | ControlProblem> {
		const path = `${CONTROL_PREFIX}${route}`;
		const signed = signControl({
			method,
			path,
			actor,
			secret: o.secret,
			...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
		});
		try {
			const r = await f(`${o.origin}${path}`, {
				method,
				headers: {
					...signed.headers,
					accept: "application/json",
					"content-type": "application/json",
				},
				...(method === "POST" ? { body: signed.body } : {}),
				signal: AbortSignal.timeout(ms),
			});
			return r.ok ? r : problemOf(r.status);
		} catch {
			return "unreachable";
		}
	}

	async function call<S extends z.ZodTypeAny>(
		schema: S,
		method: "GET" | "POST",
		route: string,
		actor: string,
		payload?: unknown,
		ms?: number,
	): Promise<ControlResult<z.infer<S>>> {
		const r = await send(method, route, actor, payload, ms);
		if (typeof r === "string") return { ok: false, problem: r };
		const parsed = schema.safeParse(await r.json().catch(() => null));
		return parsed.success ? { ok: true, data: parsed.data } : { ok: false, problem: "invalid" };
	}

	return {
		status: (actor) => call(SiteStatus, "GET", "/status", actor),
		agent: (actor) => call(AgentInfo, "GET", "/guide", actor),
		// A rebuild embeds every entry: allow it minutes, not seconds.
		ingest: (request, actor) =>
			call(IngestResult, "POST", "/guide/ingest", actor, request, 300_000),
		async ask(question, actor) {
			const r = await send("POST", "/guide/ask", actor, question, 120_000);
			if (typeof r === "string") return { ok: false, problem: r };
			if (r.body === null) return { ok: false, problem: "invalid" };
			return { ok: true, data: lines(r.body) };
		},
		push: (actor) => call(PushStats, "GET", "/push", actor),
		// A push goes out to the push services: a cold TLS connection can take seconds.
		pushTest: (subject, actor) =>
			call(PushTestResult, "POST", "/push/test", actor, { subject }, 30_000),
		async searchAccounts(email, actor) {
			const r = await call(AccountHits, "POST", "/accounts/search", actor, { email });
			return r.ok ? { ok: true, data: r.data.accounts } : r;
		},
		person: (subject, actor) => call(PersonView, "POST", "/accounts/person", actor, { subject }),
		exportAccount: (subject, actor) =>
			call(z.record(z.unknown()), "POST", "/accounts/export", actor, { subject }),
		erase: (subject, actor) => call(EraseResult, "POST", "/accounts/erase", actor, { subject }),
	};
}
