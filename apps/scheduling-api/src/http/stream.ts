import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { reaches } from "../authz/access";
import { pendingReminderCount } from "../handlers/reminders";
import type { ChangeFeed } from "../store/types";
import type { Deps, HttpEnv } from "./context";
import { prepare, refusal } from "./pipeline";

type Event = Awaited<ReturnType<ChangeFeed["since"]>>[number];
type Prepared = Awaited<ReturnType<typeof prepare>>;

/**
 * What one stream sends and who may keep receiving it. `authorize` runs on every batch with the caller's rights AS THEY
 * ARE NOW: a role edited mid-stream takes effect at the next event, and a removed member is cut off.
 */
interface Feed {
	authorize(): Promise<{ ok: boolean; show?: (event: Event) => Promise<boolean> }>;
	project(event: Event): Promise<unknown | undefined>;
}

function feedFor(deps: Deps, p: Prepared): Feed {
	const { ctx, spec } = p;
	const permitted = async (): Promise<boolean> =>
		(await deps.access.isMember(ctx.subject, ctx.app)) &&
		(await deps.access.canAll(ctx.subject, ctx.app, "requests_view"));
	if (spec.id === "calendar.stream") {
		return {
			async authorize() {
				if (!(await deps.access.isMember(ctx.subject, ctx.app))) return { ok: false };
				const reach = await deps.access.reach(
					ctx.subject,
					ctx.app,
					"calendar_view",
					"sched_calendar",
				);
				if (reach.kind === "none") return { ok: false };
				return {
					ok: true,
					async show(event) {
						if (event.kind === "request" || event.kind === "client") return false;
						if (event.kind !== "appointment" || reach.kind === "all") return true;
						const row = await deps.store.c.appointments.get(ctx.app, event.id);
						// A deleted appointment can no longer be placed on a calendar: a scoped caller is not told of it.
						return row !== undefined && reaches(reach, row.practitionerId);
					},
				};
			},
			project: (event) => Promise.resolve(event),
		};
	}
	if (spec.id === "requests.stream") {
		return {
			authorize: async () =>
				(await permitted())
					? { ok: true, show: (e) => Promise.resolve(e.kind === "request") }
					: { ok: false },
			project: (e) => Promise.resolve(e),
		};
	}
	return {
		authorize: async () =>
			(await permitted())
				? {
						ok: true,
						show: (e) =>
							Promise.resolve(
								e.kind === "request" || e.kind === "appointment" || e.kind === "roster",
							),
					}
				: { ok: false },
		async project(event) {
			const reminders = (await deps.access.canAll(ctx.subject, ctx.app, "reminders_view"))
				? await pendingReminderCount(deps, ctx.app, deps.clock())
				: undefined;
			return {
				seq: event.seq,
				at: event.at,
				requests: await deps.store.requests.pending(ctx.app),
				...(reminders === undefined ? {} : { reminders }),
			};
		},
	};
}

/**
 * A live stream, pushed from the STORE's change feed (in Convex a live query over WebSocket; never polling, never an
 * in-process emitter), so a write through one replica reaches a caller connected to another. Events carry ids and
 * counts only, and each is filtered by the caller's current rights before it is written.
 */
export async function openStream(
	deps: Deps,
	spec: RouteSpec,
	c: Context<HttpEnv>,
): Promise<Response> {
	let prepared: Prepared;
	try {
		prepared = await prepare(deps, spec, c);
	} catch (error) {
		const r = refusal(deps, error, c.get("requestId"));
		return new Response(JSON.stringify(r.body), {
			status: r.status,
			headers: { "content-type": "application/json" },
		});
	}
	const { ctx } = prepared;
	const feed = feedFor(deps, prepared);
	const head = await deps.store.changes.head(ctx.app);
	const after = typeof ctx.query.after === "number" ? ctx.query.after : head;

	return streamSSE(c, async (stream) => {
		const queue: Event[] = [];
		let wake: (() => void) | undefined;
		let failed = false;
		const poke = (): void => wake?.();
		const closed = new AbortController();
		stream.onAbort(() => closed.abort());

		let cursor = after;
		for (const event of await deps.store.changes.since(ctx.app, after)) queue.push(event);
		const unsubscribe = await deps.store.changes.subscribe(
			ctx.app,
			Math.max(after, queue.at(-1)?.seq ?? 0),
			(events) => {
				queue.push(...events);
				poke();
			},
			() => {
				failed = true;
				poke();
			},
		);
		const beat = setInterval(poke, deps.streamHeartbeatMs);
		closed.signal.addEventListener("abort", poke);

		try {
			const first = await feed.authorize();
			if (!first.ok) return;
			// `ready` says the stream is open and subscribed; for the badge it carries the counts as they are.
			const ready: Event = {
				seq: cursor,
				at: deps.clock(),
				kind: "ready",
				op: "ready",
				id: ctx.app,
			};
			await stream.writeSSE({
				data: JSON.stringify(spec.id === "inbox.stream" ? await feed.project(ready) : ready),
				id: String(cursor),
			});
			while (!closed.signal.aborted && !failed) {
				if (queue.length === 0) {
					await new Promise<void>((resolve) => {
						wake = resolve;
						if (queue.length > 0 || failed || closed.signal.aborted) resolve();
					});
					wake = undefined;
					if (queue.length === 0 && !failed && !closed.signal.aborted) {
						await stream.write(": hb\n\n");
						continue;
					}
				}
				const batch = queue.splice(0, queue.length);
				const now = await feed.authorize();
				if (!now.ok) return;
				for (const event of batch) {
					cursor = event.seq;
					if (now.show !== undefined && !(await now.show(event))) continue;
					await stream.writeSSE({
						data: JSON.stringify(await feed.project(event)),
						id: String(event.seq),
					});
				}
			}
		} finally {
			clearInterval(beat);
			unsubscribe();
		}
	});
}
