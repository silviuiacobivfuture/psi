import { z } from "zod";
import { type Consistency, ConsistencyPolicy, toWire } from "./consistency";
import { AuthzError, classify } from "./errors";
import { type ContextualClaims, type ContextualTuple, claimsToTuples } from "./tuples";

/**
 * psi's OpenFGA client, built to SEB's TypeScript SDK contract (docs/autorizare/03-contracts §7): decisions go
 * STRAIGHT to OpenFGA's read port; Polaris (the control plane) is never in the path of a Check. It stands in for
 * the SDK until SEB's bundle installs into psi (estate/platform.lock has no digest yet), with the same option and
 * method names, so the swap is an import change.
 *
 * psi's one addition: each call may carry the record's own facts (`facts.tuples`, see `recordTuples`) — the frozen
 * `CheckRequest` shape is unchanged.
 */

export interface CheckRequest {
	user: string;
	relation: string;
	object: string;
	context?: Record<string, unknown>;
	consistency?: Consistency;
}

export interface ListObjectsRequest {
	user: string;
	relation: string;
	/** The object TYPE, unqualified: `blog_saved_article`. */
	type: string;
	context?: Record<string, unknown>;
	consistency?: Consistency;
}

/** Facts for one call, beside the client's claims. */
export interface CallFacts {
	tuples?: ReadonlyArray<ContextualTuple>;
}

/** Facts per entry of a batch: each check carries only its own record's tuples (OpenFGA caps them per check). */
export interface BatchFacts {
	tuplesFor(req: CheckRequest): ReadonlyArray<ContextualTuple>;
}

export interface TokenSource {
	token(): Promise<string>;
}

/** OpenFGA's read port authenticates with a preshared key: a token with nothing to refresh. */
export class StaticTokenSource implements TokenSource {
	readonly #value: string;
	constructor(value: string) {
		this.#value = value;
	}
	token(): Promise<string> {
		return Promise.resolve(this.#value);
	}
}

export interface AuthzClientOptions {
	/** OpenFGA's READ port (`http://openfga.openfga.svc:8081`), never the admin port. */
	endpoint: string;
	storeId: string;
	/** The pinned model. Never "latest" (D5): the client refuses to construct without one. */
	modelId: string;
	token: TokenSource;
	claims?: () => ContextualClaims;
	fetch?: typeof globalThis.fetch;
	/** Retries of a transport failure or 5xx. Default 2. */
	retries?: number;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

export interface AuthzClient {
	check(req: CheckRequest, facts?: CallFacts): Promise<boolean>;
	/** Keyed by `checkKey(req)`. An entry OpenFGA gave no answer for is ABSENT — never read it as `false`. */
	batchCheck(reqs: ReadonlyArray<CheckRequest>, facts?: BatchFacts): Promise<Map<string, boolean>>;
	listObjects(req: ListObjectsRequest, facts?: CallFacts): Promise<string[]>;
	/** Forces HIGHER_CONSISTENCY for `ms` after this caller's own write. */
	afterWrite(ms?: number): void;
}

/** OpenFGA's default ceiling on one BatchCheck. */
export const MAX_CHECKS_PER_BATCH = 50;

export function checkKey(req: Pick<CheckRequest, "user" | "relation" | "object">): string {
	return `${req.user}#${req.relation}@${req.object}`;
}

/** `allowed` is omitted on the wire when false; a missing field read as allowed would fail open. */
const CheckResponse = z.object({ allowed: z.boolean().optional() });
const BatchResponse = z.object({
	result: z.record(
		z.string(),
		z.object({
			allowed: z.boolean().optional(),
			error: z.unknown().optional(),
		}),
	),
});
const ListResponse = z.object({ objects: z.array(z.string()) });
const ErrorBody = z.object({
	code: z.string().optional(),
	message: z.string().optional(),
});

export function createAuthzClient(opts: AuthzClientOptions): AuthzClient {
	if (opts.modelId.trim() === "" || opts.modelId === "latest") {
		throw new AuthzError("invalid", "authz: a pinned modelId is required (D5)");
	}
	const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
	const retries = opts.retries ?? 2;
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const consistency = new ConsistencyPolicy(opts.now ?? Date.now);
	const base = opts.endpoint.replace(/\/+$/, "");

	async function post(path: string, body: unknown): Promise<unknown> {
		let last: AuthzError = new AuthzError("unavailable", "authz: OpenFGA unreachable");
		for (let attempt = 0; attempt <= retries; attempt++) {
			let res: Response;
			try {
				res = await doFetch(`${base}/stores/${opts.storeId}${path}`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${await opts.token.token()}`,
					},
					body: JSON.stringify(body),
				});
			} catch {
				last = new AuthzError("unavailable", "authz: OpenFGA unreachable");
				if (attempt < retries) await sleep(200 * 2 ** attempt);
				continue;
			}
			if (res.ok) {
				try {
					return await res.json();
				} catch {
					throw new AuthzError("unknown", "authz: OpenFGA answered a body that is not JSON");
				}
			}
			const parsed = ErrorBody.safeParse(await res.json().catch(() => ({})));
			const upstream = parsed.success ? parsed.data : {};
			last = new AuthzError(
				classify(res.status, upstream.code),
				`authz: OpenFGA ${res.status} ${upstream.code ?? ""}`.trim(),
			);
			if (!last.retryable || attempt >= retries) throw last;
			await sleep(200 * 2 ** attempt);
		}
		throw last;
	}

	/** Claims + the call's facts, and `now` — supplied here so no caller has to know which tuple is conditioned. */
	function contextual(
		subject: string,
		perCall: Record<string, unknown> | undefined,
		facts: CallFacts | undefined,
	): {
		contextual_tuples?: { tuple_keys: ContextualTuple[] };
		context: Record<string, unknown>;
	} {
		const claims = opts.claims?.();
		if (
			(perCall !== undefined && "now" in perCall) ||
			(claims?.context && "now" in claims.context)
		) {
			// Accepting a caller's `now` would let anyone revive an expired grant (AUTZ-5).
			throw new AuthzError("invalid", "authz: `now` is supplied by the client, never the caller");
		}
		const tuples = [
			...(claims ? claimsToTuples(claims, subject) : []),
			...claimsToTuples({ tuples: facts?.tuples ?? [] }, subject),
		];
		const context = {
			...claims?.context,
			...perCall,
			now: new Date(opts.now ? opts.now() : Date.now()).toISOString(),
		};
		return {
			...(tuples.length > 0 ? { contextual_tuples: { tuple_keys: tuples } } : {}),
			context,
		};
	}

	return {
		async check(req, facts) {
			const body = {
				authorization_model_id: opts.modelId,
				tuple_key: {
					user: req.user,
					relation: req.relation,
					object: req.object,
				},
				...contextual(req.user, req.context, facts),
				consistency: toWire(consistency.resolve(req.consistency)),
			};
			return CheckResponse.parse(await post("/check", body)).allowed === true;
		},

		async batchCheck(reqs, facts) {
			const answers = new Map<string, boolean>();
			const unique = new Map<string, CheckRequest>();
			for (const req of reqs) unique.set(checkKey(req), req);
			const entries = [...unique.entries()];
			for (let i = 0; i < entries.length; i += MAX_CHECKS_PER_BATCH) {
				const chunk = entries.slice(i, i + MAX_CHECKS_PER_BATCH);
				const byCorrelation = new Map(chunk.map(([key], index) => [`c${index}`, key]));
				const strongest = chunk.some(([, r]) => r.consistency === "higher-consistency")
					? "higher-consistency"
					: undefined;
				const body = {
					authorization_model_id: opts.modelId,
					checks: chunk.map(([, req], index) => ({
						tuple_key: {
							user: req.user,
							relation: req.relation,
							object: req.object,
						},
						...contextual(req.user, req.context, {
							tuples: facts?.tuplesFor(req) ?? [],
						}),
						correlation_id: `c${index}`,
					})),
					consistency: toWire(consistency.resolve(strongest)),
				};
				const parsed = BatchResponse.parse(await post("/batch-check", body));
				for (const [id, outcome] of Object.entries(parsed.result)) {
					const key = byCorrelation.get(id);
					// A per-entry error is not an answer: reporting it as `false` would invent a silent deny.
					if (key === undefined || outcome.error !== undefined) continue;
					answers.set(key, outcome.allowed === true);
				}
			}
			return answers;
		},

		async listObjects(req, facts) {
			const body = {
				authorization_model_id: opts.modelId,
				type: req.type,
				relation: req.relation,
				user: req.user,
				...contextual(req.user, req.context, facts),
				consistency: toWire(consistency.resolve(req.consistency)),
			};
			return ListResponse.parse(await post("/list-objects", body)).objects;
		},

		afterWrite(ms) {
			consistency.afterWrite(ms);
		},
	};
}
