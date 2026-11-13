import { z } from "zod";
import { StoreRefused, StoreUnavailable } from "../types";

/**
 * The service's one way to call the server-keyed Convex wrappers (`api*`, `staff*`, `changes`): Convex's own HTTP API
 * (`POST /api/query|mutation`, `{path: "apiClients:create", args}`), the answer parsed with zod. The server key is added
 * here and nowhere else; a caller of this module never sees it. A transport failure is `StoreUnavailable` (the
 * service answers 503); a wrapper's `{ok:false, reason}` is `StoreRefused` unless the caller handles it.
 */
export interface Rpc {
	query<T>(fn: string, args: Readonly<Record<string, unknown>>, schema: z.ZodType<T>): Promise<T>;
	mutation<T>(
		fn: string,
		args: Readonly<Record<string, unknown>>,
		schema: z.ZodType<T>,
	): Promise<T>;
}

const envelope = z.discriminatedUnion("status", [
	z.object({ status: z.literal("success"), value: z.unknown() }),
	z.object({ status: z.literal("error"), errorMessage: z.string().optional() }),
]);

export interface RpcConfig {
	url: string;
	/** Added to every call as `key` (the public wrappers demand it). */
	serverKey?: string;
	/** For tests that reach internal functions (`clinicApps:ensureApp`): `Authorization: Convex <key>`. */
	adminKey?: string;
	timeoutMs?: number;
	/** Injectable for tests; defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

export function createRpc(config: RpcConfig): Rpc {
	const doFetch = config.fetch ?? fetch;
	const call = async <T>(
		kind: "query" | "mutation",
		fn: string,
		args: Readonly<Record<string, unknown>>,
		schema: z.ZodType<T>,
	): Promise<T> => {
		let response: Response;
		try {
			response = await doFetch(`${config.url}/api/${kind}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(config.adminKey === undefined ? {} : { authorization: `Convex ${config.adminKey}` }),
				},
				body: JSON.stringify({
					path: fn,
					args: config.serverKey === undefined ? args : { key: config.serverKey, ...args },
					format: "json",
				}),
				signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
			});
		} catch {
			throw new StoreUnavailable(`${fn}: the store did not answer`);
		}
		const body = envelope.safeParse(await response.json().catch(() => undefined));
		// Never Convex's message: it echoes the offending value.
		if (!response.ok || !body.success || body.data.status === "error")
			throw new StoreUnavailable(`${fn}: the store refused the call (${response.status})`);
		const value = schema.safeParse(body.data.value);
		if (!value.success) throw new StoreUnavailable(`${fn}: the store answered an unexpected shape`);
		return value.data;
	};
	return {
		query: (fn, args, schema) => call("query", fn, args, schema),
		mutation: (fn, args, schema) => call("mutation", fn, args, schema),
	};
}

/** `{ok:false, reason}`: every wrapper's refusal. */
export const Refusal = z.object({
	ok: z.literal(false),
	reason: z.string(),
	/** What stopped a staff booking (the entry, its severity and reason, what authority lets it through). */
	blacklist: z.record(z.string(), z.unknown()).optional(),
	/** The field names a refused input got wrong. */
	problems: z.array(z.string()).optional(),
	/** The occurrences of a series that stopped it, by position (see `SeriesConflictRow`). */
	conflicts: z.array(z.record(z.string(), z.unknown())).optional(),
});

/** A wrapper answer: success shape `S` (with `ok:true`) or its refusal. */
export function answer<S extends z.ZodRawShape>(success: S) {
	return z.union([z.object({ ok: z.literal(true), ...success }), Refusal]);
}

/** Unwraps an answer: the success value, or a `StoreRefused` carrying the reason. */
export function unwrap<T extends { ok: boolean }>(out: T): Extract<T, { ok: true }> {
	if (out.ok) return out as Extract<T, { ok: true }>;
	const reason = Reflect.get(out, "reason");
	const blacklist: unknown = Reflect.get(out, "blacklist");
	const problems: unknown = Reflect.get(out, "problems");
	const conflicts: unknown = Reflect.get(out, "conflicts");
	throw new StoreRefused(typeof reason === "string" ? reason : "invalid", {
		...(typeof blacklist === "object" && blacklist !== null ? { blacklist } : {}),
		...(Array.isArray(problems) ? { problems } : {}),
		...(Array.isArray(conflicts) ? { conflicts } : {}),
	});
}
