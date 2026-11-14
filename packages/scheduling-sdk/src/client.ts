import type { z } from "zod/v4";
import {
	ErrorBody,
	type InputOf,
	type OutputOf,
	ROUTES,
	type Route,
	type RouteSpec,
} from "./contract/index";
import { SchedulingApiError, SchedulingTransportError } from "./errors";
import { sseData } from "./sse";

export type Auth =
	/** An estate SSO access token (or a function giving the current one). */
	| { bearer: string | (() => string | Promise<string>) }
	/**
	 * A server-to-server service key; `subject` names the visitor on `visitor.mine*` calls (and owns a submitted
	 * request); `clientIp` is the visitor's address, which the service rate-limits by (`x-psi-client-ip`).
	 */
	| { serviceKey: string; subject?: string; clientIp?: string };

export interface ClientOptions {
	/** The service's origin, e.g. `https://api-programari.psizone.ro`. */
	baseUrl: string;
	auth: Auth;
	/** The deadline of one call. Default 10 s. A stream has none: abort it with the `signal`. */
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

type IdOf<S> = S extends { id: infer I extends string } ? I : never;
type GroupOf<I extends string> = I extends `${infer G}.${string}` ? G : never;
type OpOf<I extends string> = I extends `${string}.${infer O}` ? O : never;
type Result<S extends Route> = S extends { stream: true }
	? AsyncIterable<OutputOf<S>>
	: Promise<OutputOf<S>>;
type CallOptions = { signal?: AbortSignal };

/** The client, DERIVED from the route table: a route added to the contract is a method here, typed from its schemas. */
export type SchedulingClient = {
	[G in GroupOf<IdOf<Route>>]: {
		[S in Extract<Route, { id: `${G}.${string}` }> as OpOf<IdOf<S>>]: (
			input: InputOf<S>,
			options?: CallOptions,
		) => Result<S>;
	};
};

function keysOf(schema: z.ZodObject | undefined): string[] {
	return schema === undefined ? [] : Object.keys(schema.shape);
}

export function createSchedulingClient(options: ClientOptions): SchedulingClient {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const origin = options.baseUrl.replace(/\/+$/, "");
	const timeoutMs = options.timeoutMs ?? 10_000;

	async function headers(): Promise<Record<string, string>> {
		const out: Record<string, string> = { accept: "application/json" };
		const auth = options.auth;
		if ("bearer" in auth) {
			out.authorization = `Bearer ${typeof auth.bearer === "function" ? await auth.bearer() : auth.bearer}`;
		} else {
			out["x-service-key"] = auth.serviceKey;
			if (auth.subject !== undefined) out["x-psi-subject"] = auth.subject;
			if (auth.clientIp !== undefined) out["x-psi-client-ip"] = auth.clientIp;
		}
		return out;
	}

	async function send(
		spec: RouteSpec,
		input: Record<string, unknown>,
		signal: AbortSignal | undefined,
	): Promise<Response> {
		let path: string = spec.path;
		for (const key of keysOf(spec.params))
			path = path.replace(`:${key}`, encodeURIComponent(String(input[key])));
		const query = new URLSearchParams();
		for (const key of keysOf(spec.query)) {
			const value = input[key];
			if (value !== undefined) query.set(key, String(value));
		}
		const bodyKeys = keysOf(spec.body);
		const body =
			spec.body === undefined
				? undefined
				: JSON.stringify(
						Object.fromEntries(
							bodyKeys.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]),
						),
					);
		const deadline = AbortSignal.timeout(timeoutMs);
		const signals =
			spec.stream === true ? (signal ? [signal] : []) : signal ? [deadline, signal] : [deadline];
		try {
			return await doFetch(`${origin}${path}${query.size > 0 ? `?${query}` : ""}`, {
				method: spec.method,
				headers: {
					...(await headers()),
					...(body === undefined ? {} : { "content-type": "application/json" }),
					...(spec.stream === true ? { accept: "text/event-stream" } : {}),
				},
				...(body === undefined ? {} : { body }),
				...(signals.length > 0 ? { signal: AbortSignal.any(signals) } : {}),
			});
		} catch (error) {
			if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
				throw new SchedulingTransportError(
					"timeout",
					`${spec.id} did not answer in ${timeoutMs} ms`,
				);
			throw new SchedulingTransportError("unreachable", `${spec.id}: the service is unreachable`);
		}
	}

	async function refusal(res: Response): Promise<SchedulingApiError | SchedulingTransportError> {
		const parsed = ErrorBody.safeParse(await res.json().catch(() => undefined));
		if (!parsed.success)
			return new SchedulingTransportError(
				"bad_response",
				`the service answered ${res.status} in a shape the contract does not allow`,
			);
		return new SchedulingApiError(res.status, parsed.data.error);
	}

	async function call(
		spec: RouteSpec,
		input: Record<string, unknown>,
		callOptions: CallOptions | undefined,
	): Promise<unknown> {
		const res = await send(spec, input, callOptions?.signal);
		if (!res.ok) throw await refusal(res);
		const parsed = spec.response.safeParse(await res.json().catch(() => undefined));
		if (!parsed.success)
			throw new SchedulingTransportError(
				"bad_response",
				`${spec.id}: the answer does not match the contract`,
			);
		return parsed.data;
	}

	async function* stream(
		spec: RouteSpec,
		input: Record<string, unknown>,
		callOptions: CallOptions | undefined,
	): AsyncGenerator<unknown> {
		const res = await send(spec, input, callOptions?.signal);
		if (!res.ok) throw await refusal(res);
		if (res.body === null)
			throw new SchedulingTransportError("bad_response", `${spec.id}: no stream`);
		for await (const data of sseData(res.body, callOptions?.signal)) {
			const parsed = spec.response.safeParse(data);
			if (!parsed.success)
				throw new SchedulingTransportError(
					"bad_response",
					`${spec.id}: an event does not match the contract`,
				);
			yield parsed.data;
		}
	}

	const groups: Record<
		string,
		Record<string, (input: Record<string, unknown>, o?: CallOptions) => unknown>
	> = {};
	for (const spec of ROUTES as ReadonlyArray<RouteSpec>) {
		const [group = "", op = ""] = spec.id.split(".");
		const ops = groups[group] ?? {};
		ops[op] = (input, o) => (spec.stream === true ? stream(spec, input, o) : call(spec, input, o));
		groups[group] = ops;
	}
	if (!isComplete(groups)) throw new Error("the client misses a route of the contract");
	return groups;
}

/** Every route of the table is a method: the one place the runtime shape is checked against the derived type. */
function isComplete(
	value: Record<string, Record<string, unknown>>,
): value is Record<string, Record<string, unknown>> & SchedulingClient {
	return (ROUTES as ReadonlyArray<RouteSpec>).every((spec) => {
		const [group = "", op = ""] = spec.id.split(".");
		return typeof value[group]?.[op] === "function";
	});
}
