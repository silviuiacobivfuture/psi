import { z } from "zod";

/**
 * Calls internal Convex functions with the deployment's admin key, over its documented HTTP API
 * (`POST /api/mutation`, `/api/query`, header `Authorization: Convex <admin key>`). This is how the
 * import and the ops tools reach functions no browser or app can. Every answer is parsed with zod.
 *
 * Rows go in the request body, never in argv. A failure throws an error that names the function,
 * the status and the argument path Convex complained about; it never carries Convex's message,
 * which echoes the offending value.
 */
export class AdminCallError extends Error {
	readonly fn: string;

	constructor(fn: string, detail: string) {
		super(`${fn}: ${detail}`);
		this.name = "AdminCallError";
		this.fn = fn;
	}
}

const envelope = z.discriminatedUnion("status", [
	z.object({ status: z.literal("success"), value: z.unknown() }),
	z.object({ status: z.literal("error"), errorMessage: z.string().optional() }),
]);

const PATH = /Path: ([\w.[\]]+)/;

export interface AdminClient {
	mutation<T>(
		fn: string,
		args: Readonly<Record<string, unknown>>,
		schema: z.ZodType<T>,
	): Promise<T>;
	query<T>(fn: string, args: Readonly<Record<string, unknown>>, schema: z.ZodType<T>): Promise<T>;
}

export function createAdminClient(config: {
	url: string;
	adminKey: string;
	timeoutMs?: number;
}): AdminClient {
	const call = async <T>(
		kind: "mutation" | "query",
		fn: string,
		args: Readonly<Record<string, unknown>>,
		schema: z.ZodType<T>,
	): Promise<T> => {
		let response: Response;
		try {
			response = await fetch(`${config.url}/api/${kind}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Convex ${config.adminKey}`,
				},
				body: JSON.stringify({ path: fn, args, format: "json" }),
				signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
			});
		} catch {
			throw new AdminCallError(fn, "unreachable or too slow");
		}
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			throw new AdminCallError(fn, `HTTP ${response.status}, not JSON`);
		}
		const parsed = envelope.safeParse(body);
		if (!parsed.success) throw new AdminCallError(fn, `HTTP ${response.status}, unexpected answer`);
		if (parsed.data.status === "error") {
			const path = PATH.exec(parsed.data.errorMessage ?? "")?.[1];
			throw new AdminCallError(fn, `refused${path === undefined ? "" : ` at ${path}`}`);
		}
		const value = schema.safeParse(parsed.data.value);
		if (!value.success) {
			throw new AdminCallError(
				fn,
				`answer has the wrong shape at ${value.error.issues[0]?.path.join(".") ?? "(root)"}`,
			);
		}
		return value.data;
	};
	return {
		mutation: (fn, args, schema) => call("mutation", fn, args, schema),
		query: (fn, args, schema) => call("query", fn, args, schema),
	};
}
