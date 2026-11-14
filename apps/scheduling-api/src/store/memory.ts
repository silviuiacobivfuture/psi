import { currentActor } from "./actor";
import { createMemoryAssistant } from "./memory-assistant";
import { createMemoryBlacklist } from "./memory-blacklist";
import { MemoryCollection } from "./memory-collection";
import { createMemoryFeedback } from "./memory-feedback";
import { createMemoryKeyed } from "./memory-keyed";
import { memoryKeys } from "./memory-keys";
import { createMemoryReports } from "./memory-reports";
import { applyVisitRules } from "./memory-rules";
import { createMemorySeries } from "./memory-series";
import { applyTeamRules } from "./memory-team";
import { createMemoryVisitor } from "./memory-visitor";
import type { StoredDocument } from "./ports";
import { COLLECTIONS, type CollectionName, type Rows, type StorePort, StoreRefused } from "./types";

/** The store's own bound on one document (the Convex wrapper's `MAX_DOCUMENT_CHARS`). */
const MAX_DOCUMENT_CHARS = 512_000;

export interface MemoryStore extends StorePort {
	/** Everything held, for tests that assert that a refusal wrote nothing. */
	dump(): string;
}

type Changes = {
	seq: number;
	at: number;
	kind: "appointment" | "client" | "roster" | "request" | "ready";
	op: "created" | "updated" | "deleted" | "ready";
	id: string;
};

export function createMemoryStore(clock: () => number = Date.now): MemoryStore {
	const c = Object.fromEntries(COLLECTIONS.map((name) => [name, new MemoryCollection()])) as {
		[K in CollectionName]: MemoryCollection<Rows[K]>;
	};
	const blacklist = createMemoryBlacklist(c, clock);
	applyVisitRules(c, blacklist.staff);
	applyTeamRules(c);
	const events = new Map<string, Changes[]>();
	const listeners = new Map<string, Set<(events: Changes[]) => void>>();
	const changes: StorePort["changes"] = {
		append(app, event) {
			const log = events.get(app) ?? [];
			const entry: Changes = { seq: (log.at(-1)?.seq ?? 0) + 1, at: clock(), ...event };
			log.push(entry);
			events.set(app, log);
			for (const listener of listeners.get(app) ?? []) listener([entry]);
			return Promise.resolve();
		},
		subscribe(app, after, onEvents) {
			const set = listeners.get(app) ?? new Set();
			const listener = (batch: Changes[]): void => {
				const fresh = batch.filter((e) => e.seq > after);
				if (fresh.length > 0) onEvents(fresh);
			};
			set.add(listener);
			listeners.set(app, set);
			return Promise.resolve(() => set.delete(listener) && undefined);
		},
		since: (app, seq) => Promise.resolve((events.get(app) ?? []).filter((e) => e.seq > seq)),
		head: (app) => Promise.resolve(events.get(app)?.at(-1)?.seq ?? 0),
	};
	const { visitor, requests, bookings, state } = createMemoryVisitor(c, clock, blacklist.online);
	const feedback = createMemoryFeedback(c, clock, bookings.byReference, bookings.byId);
	const assistant = createMemoryAssistant(
		clock,
		async (app) => (await c.apps.get(app, app)) !== undefined,
	);
	const keyed = createMemoryKeyed(c.apps, clock);
	const documents = new Map<string, StoredDocument>();
	const docs: StorePort["docs"] = {
		get: (app, kind) => Promise.resolve(documents.get(`${app}|${kind}`)),
		async put(app, kind, expected, body) {
			if ((await c.apps.get(app, app)) === undefined) throw new StoreRefused("not_found");
			if (!Number.isInteger(expected) || expected < 0 || body.length > MAX_DOCUMENT_CHARS)
				throw new StoreRefused("invalid");
			const held = documents.get(`${app}|${kind}`);
			if ((held?.revision ?? 0) !== expected) throw new StoreRefused("stale");
			const saved = { revision: expected + 1, body, updatedAt: clock(), updatedBy: currentActor() };
			documents.set(`${app}|${kind}`, saved);
			return { revision: saved.revision, updatedAt: saved.updatedAt };
		},
	};
	return {
		c,
		changes,
		appsOf: (subject) =>
			Promise.resolve(
				c.members
					.all()
					.filter((m) => m.subject === subject)
					.map((m) => ({ app: m.app, roles: m.roles })),
			),
		visitor,
		requests,
		docs,
		platform: assistant.platform,
		usage: assistant.usage,
		blacklist: blacklist.port,
		feedback: feedback.port,
		keys: memoryKeys(),
		series: createMemorySeries(c.appointments),
		reports: createMemoryReports(c, bookings.web, feedback.port, blacklist.port),
		keyed: keyed.port,
		ping: () => Promise.resolve(),
		dump: () =>
			JSON.stringify([
				COLLECTIONS.map((name) => c[name].all()),
				[...events.entries()],
				state(),
				[...documents.entries()],
				blacklist.state(),
				feedback.state(),
				assistant.state(),
				keyed.state(),
			]),
	};
}
