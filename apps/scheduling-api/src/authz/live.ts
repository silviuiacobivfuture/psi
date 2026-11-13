import { z } from "zod";
import { type AuthzPort, AuthzUnavailable, type Tuple, type TupleChange } from "./port";

export interface LiveAuthzOptions {
	/** OpenFGA's read port (`http://openfga.openfga.svc:8081`): Check and ListObjects. */
	readUrl: string;
	/** Where tuples are written. A separate setting, because Polaris refuses machine writes of usersets (docs/plans/clinic.md). */
	writeUrl: string;
	storeId: string;
	/** The pinned model id. Never "latest": the adapter refuses to be built without one. */
	modelId: string;
	token: string;
	fetch?: typeof globalThis.fetch;
	now?: () => number;
	timeoutMs?: number;
}

const Check = z.object({ allowed: z.boolean().optional() });
const Batch = z.object({
	result: z.record(
		z.string(),
		z.object({ allowed: z.boolean().optional(), error: z.unknown().optional() }),
	),
});
/** OpenFGA's default ceiling for one BatchCheck. */
const BATCH_MAX = 50;
const List = z.object({ objects: z.array(z.string()) });
const WRITE_CHUNK = 100;
/** After our own write, read at the stronger consistency for a moment so a role edit applies at once. */
const STRONG_FOR_MS = 3000;

export function createLiveAuthz(options: LiveAuthzOptions): AuthzPort {
	if (options.modelId.trim() === "" || options.modelId === "latest")
		throw new AuthzUnavailable("authz: a pinned model id is required");
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const now = options.now ?? Date.now;
	let strongUntil = 0;

	async function post(base: string, path: string, body: unknown): Promise<unknown> {
		let res: Response;
		try {
			res = await doFetch(`${base.replace(/\/+$/, "")}/stores/${options.storeId}${path}`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${options.token}` },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
			});
		} catch {
			throw new AuthzUnavailable("authz: OpenFGA is unreachable");
		}
		if (!res.ok) {
			const code = z
				.object({ code: z.string() })
				.safeParse(await res.json().catch(() => undefined));
			throw new AuthzUnavailable(
				`authz: OpenFGA answered ${res.status}${code.success ? ` ${code.data.code}` : ""}`,
			);
		}
		return res.json().catch(() => {
			throw new AuthzUnavailable("authz: OpenFGA answered a body that is not JSON");
		});
	}

	const consistency = (): "HIGHER_CONSISTENCY" | "MINIMIZE_LATENCY" =>
		now() < strongUntil ? "HIGHER_CONSISTENCY" : "MINIMIZE_LATENCY";
	const context = (): { now: string } => ({ now: new Date(now()).toISOString() });
	const keys = (tuples: readonly Tuple[]): { user: string; relation: string; object: string }[] =>
		tuples.map((t) => ({ user: t.user, relation: t.relation, object: t.object }));

	return {
		async check(user, relation, object) {
			const raw = await post(options.readUrl, "/check", {
				authorization_model_id: options.modelId,
				tuple_key: { user, relation, object },
				context: context(),
				consistency: consistency(),
			});
			// `allowed` is omitted on the wire when false: absence is a refusal, never an allow.
			return Check.parse(raw).allowed === true;
		},
		async checkMany(checks) {
			const answers: boolean[] = [];
			for (let at = 0; at < checks.length; at += BATCH_MAX) {
				const chunk = checks.slice(at, at + BATCH_MAX);
				const raw = await post(options.readUrl, "/batch-check", {
					authorization_model_id: options.modelId,
					checks: chunk.map((q, i) => ({
						tuple_key: { user: q.user, relation: q.relation, object: q.object },
						context: context(),
						correlation_id: String(i),
					})),
					consistency: consistency(),
				});
				const result = Batch.parse(raw).result;
				chunk.forEach((_q, i) => {
					const item = result[String(i)];
					// A missing item or an item with an error is not an answer: the whole call fails closed.
					if (item === undefined || item.error !== undefined)
						throw new AuthzUnavailable("authz: OpenFGA could not answer a batched check");
					answers.push(item.allowed === true);
				});
			}
			return answers;
		},
		async listObjects(user, relation, type) {
			const raw = await post(options.readUrl, "/list-objects", {
				authorization_model_id: options.modelId,
				type,
				relation,
				user,
				context: context(),
				consistency: consistency(),
			});
			return List.parse(raw).objects;
		},
		async write(change: TupleChange) {
			const writes = keys(change.writes);
			const deletes = keys(change.deletes);
			for (let at = 0; at < Math.max(writes.length, deletes.length); at += WRITE_CHUNK) {
				const w = writes.slice(at, at + WRITE_CHUNK);
				const d = deletes.slice(at, at + WRITE_CHUNK);
				await post(options.writeUrl, "/write", {
					authorization_model_id: options.modelId,
					...(w.length > 0 ? { writes: { tuple_keys: w, on_duplicate: "ignore" } } : {}),
					...(d.length > 0 ? { deletes: { tuple_keys: d, on_missing: "ignore" } } : {}),
				});
			}
			strongUntil = now() + STRONG_FOR_MS;
		},
	};
}
