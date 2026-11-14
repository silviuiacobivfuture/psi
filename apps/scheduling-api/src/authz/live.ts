import { z } from "zod";
import { timed } from "../timing";
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
	/**
	 * Scopes this instance's app objects in a store another instance shares: `sched_app:psizone` is written and read as
	 * `sched_app:<prefix>psizone` (`prod-` gives `sched_app:prod-psizone`), so a role held in one instance grants
	 * nothing in the other. Empty: the ids go out as they are.
	 */
	appPrefix?: string;
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
/** How many BatchChecks one call has in flight at once. */
const BATCH_PARALLEL = 10;
const List = z.object({ objects: z.array(z.string()) });
/** OpenFGA's default ListObjects result cap (`OPENFGA_LIST_OBJECTS_MAX_RESULTS`, which the estate leaves unset). */
const LIST_MAX = 1000;
const WRITE_CHUNK = 100;
/** After our own write, read at the stronger consistency for a moment so a role edit applies at once. */
const STRONG_FOR_MS = 3000;

export function createLiveAuthz(options: LiveAuthzOptions): AuthzPort {
	if (options.modelId.trim() === "" || options.modelId === "latest")
		throw new AuthzUnavailable("authz: a pinned model id is required");
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const now = options.now ?? Date.now;
	let strongUntil = 0;
	const prefix = options.appPrefix ?? "";
	const appHead = "sched_app:";
	/** `sched_app:x` and `sched_app:x#member` gain the prefix on the wire; every other object is untouched. */
	const wire = (id: string): string =>
		prefix !== "" && id.startsWith(appHead) ? `${appHead}${prefix}${id.slice(appHead.length)}` : id;

	const post = (base: string, path: string, body: unknown): Promise<unknown> =>
		timed("fga", () => send(base, path, body));

	async function send(base: string, path: string, body: unknown): Promise<unknown> {
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
		tuples.map((t) => ({ user: wire(t.user), relation: t.relation, object: wire(t.object) }));

	return {
		async check(user, relation, object) {
			const raw = await post(options.readUrl, "/check", {
				authorization_model_id: options.modelId,
				tuple_key: { user: wire(user), relation, object: wire(object) },
				context: context(),
				consistency: consistency(),
			});
			// `allowed` is omitted on the wire when false: absence is a refusal, never an allow.
			return Check.parse(raw).allowed === true;
		},
		async checkMany(checks) {
			const chunks: (typeof checks)[] = [];
			for (let at = 0; at < checks.length; at += BATCH_MAX)
				chunks.push(checks.slice(at, at + BATCH_MAX));
			const one = async (chunk: typeof checks): Promise<boolean[]> => {
				const raw = await post(options.readUrl, "/batch-check", {
					authorization_model_id: options.modelId,
					checks: chunk.map((q, i) => ({
						tuple_key: { user: wire(q.user), relation: q.relation, object: wire(q.object) },
						context: context(),
						correlation_id: String(i),
					})),
					consistency: consistency(),
				});
				const result = Batch.parse(raw).result;
				return chunk.map((_q, i) => {
					const item = result[String(i)];
					// A missing item or an item with an error is not an answer: the whole call fails closed.
					if (item === undefined || item.error !== undefined)
						throw new AuthzUnavailable("authz: OpenFGA could not answer a batched check");
					return item.allowed === true;
				});
			};
			// The whole catalogue is ~480 questions, ten BatchChecks: one after another they cost ~1.3 s on the estate's
			// OpenFGA, four at a time ~0.9 s, all ten at once ~0.6 s (measured in the cluster). Bounded, for a larger ask.
			const answers: boolean[][] = new Array(chunks.length);
			let next = 0;
			const worker = async (): Promise<void> => {
				while (next < chunks.length) {
					const at = next++;
					const chunk = chunks[at];
					if (chunk !== undefined) answers[at] = await one(chunk);
				}
			};
			await Promise.all(Array.from({ length: Math.min(BATCH_PARALLEL, chunks.length) }, worker));
			return answers.flat();
		},
		async listObjects(user, relation, type) {
			const raw = await post(options.readUrl, "/list-objects", {
				authorization_model_id: options.modelId,
				type,
				relation,
				user: wire(user),
				context: context(),
				consistency: consistency(),
			});
			const objects = List.parse(raw).objects;
			// OpenFGA stops a ListObjects at its result cap without saying so: an answer that reaches the cap may be partial,
			// and a partial reach would hide clients silently. It fails closed instead.
			if (objects.length >= LIST_MAX)
				throw new AuthzUnavailable("authz: ListObjects reached its result cap");
			if (prefix === "" || type !== "sched_app") return objects;
			// Only this instance's apps, with the prefix taken off again.
			const own = `${appHead}${prefix}`;
			return objects
				.filter((o) => o.startsWith(own))
				.map((o) => `${appHead}${o.slice(own.length)}`);
		},
		async write(change: TupleChange) {
			// OpenFGA bounds one write request by the writes AND deletes together: 100 tuples in all, deletes first.
			const all = [
				...keys(change.deletes).map((tuple) => ({ tuple, delete: true })),
				...keys(change.writes).map((tuple) => ({ tuple, delete: false })),
			];
			for (let at = 0; at < all.length; at += WRITE_CHUNK) {
				const part = all.slice(at, at + WRITE_CHUNK);
				const w = part.filter((p) => !p.delete).map((p) => p.tuple);
				const d = part.filter((p) => p.delete).map((p) => p.tuple);
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
