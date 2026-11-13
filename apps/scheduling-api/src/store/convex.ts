import { accountHashOf, type SchedulingClient, type StaffSchedulingClient } from "@psi/scheduling";
import type { ConvexClient } from "convex/browser";
import { accessCollections } from "./convex/access";
import { blacklistPort } from "./convex/blacklist";
import { caller } from "./convex/call";
import { catalogCollections } from "./convex/catalog";
import type { PartialCollections } from "./convex/collections";
import { documentsPort } from "./convex/documents";
import { createChangeFeed } from "./convex/feed";
import { feedbackPort } from "./convex/feedback";
import { appsOfSubject } from "./convex/members";
import { recordCollections } from "./convex/records";
import { requestsPort, visitorExtras } from "./convex/requests";
import type { Rpc } from "./convex/rpc";
import { visitCollections } from "./convex/visits";
import type { Collection, CollectionName, Rows, StorePort } from "./types";

/**
 * The Convex adapter: every collection of the StorePort re-backed on the server-keyed wrappers of
 * packages/scheduling/convex (one area per file under ./convex), the visitor flow on the existing clients, web requests
 * and the change feed on live queries. Nothing answers "not available": a store that cannot be reached is
 * `StoreUnavailable` (503).
 */
export interface ConvexClients {
	/** The server-keyed wrappers (`api*`, `staff*`) over Convex's HTTP API. */
	rpc: Rpc;
	visitor: SchedulingClient;
	staff: StaffSchedulingClient;
	/** A WebSocket client of the deployment: live queries (`onUpdate`) feed the streams. */
	live: ConvexClient;
	serverKey: string;
}

/** A collection an area was meant to provide; one missing is a bug found at start-up, never an answer to a caller. */
function need<K extends CollectionName>(wired: PartialCollections, name: K): Collection<Rows[K]> {
	const found = wired[name];
	if (found === undefined) throw new Error(`the Convex adapter does not wire ${name}`);
	return found;
}

export function createConvexStore(clients: ConvexClients): StorePort {
	const wired = {
		...catalogCollections(clients.rpc),
		...visitCollections(clients.rpc),
		...recordCollections(clients.rpc),
		...accessCollections(clients.rpc),
	};
	const c: StorePort["c"] = {
		apps: need(wired, "apps"),
		members: need(wired, "members"),
		roles: need(wired, "roles"),
		people: need(wired, "people"),
		rooms: need(wired, "rooms"),
		devices: need(wired, "devices"),
		groups: need(wired, "groups"),
		services: need(wired, "services"),
		clients: need(wired, "clients"),
		appointments: need(wired, "appointments"),
		packages: need(wired, "packages"),
		payments: need(wired, "payments"),
		roster: need(wired, "roster"),
		leave: need(wired, "leave"),
		reminders: need(wired, "reminders"),
		records: need(wired, "records"),
		files: need(wired, "files"),
		audit: need(wired, "audit"),
		definitions: need(wired, "definitions"),
		imports: need(wired, "imports"),
	};
	return {
		c,
		appsOf: (subject) => appsOfSubject(caller(clients.rpc), subject),
		changes: createChangeFeed(clients.live, clients.rpc, clients.serverKey),
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
			...visitorExtras(clients.rpc),
		},
		requests: requestsPort(clients.rpc, clients.staff),
		docs: documentsPort(clients.rpc),
		blacklist: blacklistPort(clients.rpc),
		feedback: feedbackPort(clients.rpc),
		ping: () => clients.visitor.services("psizone").then(() => undefined),
	};
}
