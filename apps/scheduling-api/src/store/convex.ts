import {
	accountHashOf,
	DecisionReasonSchema,
	type SchedulingClient,
	type StaffSchedulingClient,
} from "@psi/scheduling";
import type { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import {
	COLLECTIONS,
	type Collection,
	type CollectionName,
	NotAvailableYet,
	type Rows,
	type StorePort,
} from "./types";

/**
 * The Convex adapter. What the deployment already has is wired: the visitor flow (services, slots, holds, requests,
 * cancel) and the web requests. Everything the new model adds (clients, appointments CRUD, packages, records, files,
 * roles, audit, builder definitions, the change feed) is `not_available_yet` until packages/scheduling/convex gains
 * those functions (branch clinic/model2); the list is in apps/scheduling-api/README.md. Every method names what it needs.
 */
function missing<R extends { id: string; app: string }>(name: string): Collection<R> {
	const refuse = (op: string): Promise<never> =>
		Promise.reject(new NotAvailableYet(`${name}.${op}`));
	return {
		get: () => refuse("get"),
		list: () => refuse("list"),
		insert: () => refuse("insert"),
		replace: () => refuse("replace"),
		remove: () => refuse("remove"),
	};
}

export interface ConvexClients {
	visitor: SchedulingClient;
	staff: StaffSchedulingClient;
	/** A WebSocket client of the deployment: live queries (`onUpdate`) feed the streams. */
	live: ConvexClient;
	serverKey: string;
}

const CHANGES = makeFunctionReference<"query">("changes:since");
const ChangesSchema = z.object({
	changes: z.array(
		z.object({ kind: z.string(), entityId: z.string(), at: z.number(), version: z.number() }),
	),
	cursor: z.number(),
	hasMore: z.boolean(),
});

/** The store's change kinds as the calendar and inbox streams know them. */
function toEvent(
	change: { kind: string; entityId: string; at: number },
	cursor: number,
): {
	seq: number;
	at: number;
	kind: "appointment" | "client" | "roster" | "request" | "ready";
	op: "updated";
	id: string;
} {
	const kind =
		change.kind === "visit"
			? "appointment"
			: change.kind === "client"
				? "client"
				: change.kind === "roster" || change.kind === "staff_block"
					? "roster"
					: "ready";
	return { seq: Math.floor(cursor), at: change.at, kind, op: "updated", id: change.entityId };
}

export function createConvexStore(clients: ConvexClients): StorePort {
	const c = Object.fromEntries(COLLECTIONS.map((name) => [name, missing(name)])) as {
		[K in CollectionName]: Collection<Rows[K]>;
	};
	const unavailable = (what: string): Promise<never> => Promise.reject(new NotAvailableYet(what));
	return {
		c,
		appsOf: () => unavailable("members.appsOf"),
		changes: {
			// The clinic wrappers append to the change log themselves, in the same transaction as the write: nothing to do here.
			append: () => Promise.resolve(),
			async since(app, seq) {
				const out = ChangesSchema.safeParse(
					await clients.live.query(CHANGES, { key: clients.serverKey, tenant: app, cursor: seq }),
				);
				return out.success ? out.data.changes.map((c) => toEvent(c, out.data.cursor)) : [];
			},
			// The log's cursor is a creation time: "now" is the head.
			head: () => Promise.resolve(Date.now()),
			// A live query: Convex pushes a new result whenever the app's log grows, over the WebSocket. The reader keeps the cursor.
			subscribe(app, after, onEvents, onError) {
				let cursor = after;
				const unsubscribe = clients.live.onUpdate(
					CHANGES,
					{ key: clients.serverKey, tenant: app, cursor: after },
					(raw: unknown) => {
						const parsed = ChangesSchema.safeParse(raw);
						if (!parsed.success)
							return onError(new Error("changes:since answered an unexpected shape"));
						if (parsed.data.changes.length === 0) return;
						cursor = Math.max(cursor, parsed.data.cursor);
						onEvents(parsed.data.changes.map((c) => toEvent(c, parsed.data.cursor)));
					},
					(error: Error) => onError(error),
				);
				return Promise.resolve(() => unsubscribe());
			},
		},
		visitor: {
			async services(app) {
				const out = await clients.visitor.services(app);
				return out === undefined
					? undefined
					: {
							timeZone: out.timeZone,
							services: out.services.map((s) => ({
								slug: s.slug,
								...(s.name === undefined ? {} : { name: s.name }),
								durationMinutes: s.durationMinutes,
								modes: [...s.modes],
								practitioners: s.practitioners.map((p) => ({ id: p.id, name: p.name })),
							})),
						};
			},
			async slots(app, q) {
				const out = await clients.visitor.findSlots({
					tenant: app,
					service: q.service,
					from: q.from,
					to: q.to,
					...(q.mode ? { mode: q.mode } : {}),
					...(q.limit ? { limit: q.limit } : {}),
				});
				if (!out.ok) return { ok: false, reason: out.reason };
				return {
					ok: true,
					timeZone: out.timeZone,
					service: out.service,
					slots: out.slots.map((s) => ({
						id: s.id,
						practitioner: s.practitioner,
						practitionerName: s.practitionerName,
						start: s.start,
						end: s.end,
						modes: [...s.modes],
					})),
				};
			},
			hold: (app, input) => clients.visitor.hold({ tenant: app, ...input }),
			release: async (_app, reference, holdToken) => {
				const out = await clients.visitor.release({ reference, holdToken });
				return out.ok ? { ok: true } : { ok: false, reason: out.reason };
			},
			async submit(_app, input) {
				const { subject, ...rest } = input;
				const out = await clients.visitor.submit({
					...rest,
					...(subject === undefined ? {} : { accountHash: accountHashOf(subject) }),
				});
				return out.ok ? out : { ok: false, reason: out.reason };
			},
			cancel: (_app, reference, cancelCode) => clients.visitor.cancel({ reference, cancelCode }),
			callback: () => unavailable("visitor.callback (a request with no slot)"),
			mine: () => unavailable("visitor.mine (the visitor's appointments by subject)"),
			cancelMine: () => unavailable("visitor.cancelMine"),
		},
		requests: {
			async list(app, from, to) {
				const out = await clients.staff.requests({ tenant: app, from, to });
				if (!out.ok) return [];
				return out.requests.map((r) => ({
					reference: r.reference,
					status: r.status === "held" || r.status === "expired" ? ("requested" as const) : r.status,
					start: r.start,
					end: r.end,
					serviceSlug: r.serviceSlug,
					createdAt: r.submittedAt ?? r.start,
					...(r.contact === undefined
						? {}
						: {
								contact: {
									name: r.contact.name,
									...(r.contact.phone === undefined ? {} : { phone: r.contact.phone }),
									...(r.contact.email === undefined ? {} : { email: r.contact.email }),
								},
							}),
				}));
			},
			async pending(app) {
				const out = await clients.staff.requests({
					tenant: app,
					from: 0,
					to: Number.MAX_SAFE_INTEGER,
					statuses: ["requested"],
				});
				return out.ok ? out.requests.length : 0;
			},
			async decide(app, reference, decision, reason, actor) {
				const known = DecisionReasonSchema.safeParse(reason);
				const out = await clients.staff.decide({
					tenant: app,
					reference,
					decision,
					...(known.success ? { reason: known.data } : {}),
					actor: { subject: actor },
				});
				return out.ok ? { ok: true } : { ok: false, reason: out.reason };
			},
		},
		ping: () => clients.visitor.services("psizone").then(() => undefined),
	};
}
