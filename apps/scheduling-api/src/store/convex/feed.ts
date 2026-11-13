import type { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import type { ChangeFeed } from "../types";
import type { Rpc } from "./rpc";

/**
 * The change feed on Convex. The clinic wrappers append to the change log in the transaction of the write, so `append`
 * does nothing. Two live queries feed the streams, over the WebSocket (`ConvexClient.onUpdate`): `changes:since` (the
 * clinic log: visits, clients, roster...) and `webRequests:feed` (booking requests and callbacks, which have no log
 * entry). Both are cursored by a time in ms, which is the event's `seq`, so a client that resumes with `after` gets
 * what came after it from either.
 */
const CHANGES = makeFunctionReference<"query">("changes:since");
const REQUESTS = makeFunctionReference<"query">("webRequests:feed");

const Logged = z.object({
	changes: z.array(
		z.object({
			kind: z.string(),
			entityId: z.string(),
			at: z.number(),
			version: z.number(),
			seq: z.number(),
		}),
	),
	cursor: z.number(),
	hasMore: z.boolean(),
});
const Requested = z.object({
	changes: z.array(z.object({ reference: z.string(), at: z.number() })),
	cursor: z.number(),
});

type Event = Awaited<ReturnType<ChangeFeed["since"]>>[number];

const kindOf = (log: string): Event["kind"] =>
	log === "visit"
		? "appointment"
		: log === "client"
			? "client"
			: log === "roster" || log === "staff_block"
				? "roster"
				: "ready";

const fromLog = (c: z.infer<typeof Logged>["changes"][number]): Event => ({
	seq: Math.floor(c.seq),
	at: c.at,
	kind: kindOf(c.kind),
	op: "updated",
	id: c.entityId,
});
const fromRequest = (c: z.infer<typeof Requested>["changes"][number]): Event => ({
	seq: Math.floor(c.at),
	at: c.at,
	kind: "request",
	op: "updated",
	id: c.reference,
});

/** A live answer as events, or `undefined` when it is not the shape the query promises. */
type Reader = (raw: unknown) => Event[] | undefined;
const readLog: Reader = (raw) => {
	const out = Logged.safeParse(raw);
	return out.success ? out.data.changes.map(fromLog) : undefined;
};
const readRequests: Reader = (raw) => {
	const out = Requested.safeParse(raw);
	return out.success ? out.data.changes.map(fromRequest) : undefined;
};

export function createChangeFeed(live: ConvexClient, rpc: Rpc, serverKey: string): ChangeFeed {
	return {
		append: () => Promise.resolve(),
		async since(app, seq) {
			const [log, requests] = await Promise.all([
				rpc.query("changes:since", { tenant: app, cursor: seq }, Logged),
				rpc.query("webRequests:feed", { tenant: app, cursor: seq }, Requested),
			]);
			return [...log.changes.map(fromLog), ...requests.changes.map(fromRequest)].sort(
				(a, b) => a.seq - b.seq,
			);
		},
		// The log's cursor is a creation time: "now" is the head.
		head: () => Promise.resolve(Date.now()),
		subscribe(app, after, onEvents, onError) {
			// Each query re-runs with the cursor it was subscribed with and answers everything after it, so what was already
			// sent is dropped by its own cursor here.
			const sources = [
				{ fn: CHANGES, read: readLog },
				{ fn: REQUESTS, read: readRequests },
			];
			const stops = sources.map((source) => {
				let sent = after;
				return live.onUpdate(
					source.fn,
					{ key: serverKey, tenant: app, cursor: after },
					(raw: unknown) => {
						const events = source.read(raw);
						if (events === undefined)
							return onError(new Error("the store answered an unexpected shape"));
						const fresh = events.filter((e) => e.seq > sent);
						if (fresh.length === 0) return;
						sent = Math.max(sent, ...fresh.map((e) => e.seq));
						onEvents(fresh);
					},
					(error: Error) => onError(error),
				);
			});
			return Promise.resolve(() => {
				for (const stop of stops) stop();
			});
		},
	};
}
