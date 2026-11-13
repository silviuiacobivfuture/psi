import {
	type BlacklistCandidate,
	type BlacklistEntry,
	blacklistGate,
	blacklistInputSchema,
	blacklistMatch,
	blacklistPatchSchema,
	CLEARABLE_FIELDS,
	MAX_ACTIVE_ENTRIES,
	type Override,
	severityAllowed,
} from "@psi/scheduling/clinic";
import { currentActor } from "./actor";
import { newId } from "./ids";
import type { BlacklistEventRow, BlacklistPort, BlacklistRow } from "./ports";
import { type Collection, type Rows, StoreRefused } from "./types";

type Cs = { [K in keyof Rows]: Collection<Rows[K]> };

/** The online path's audit actor, as the Convex gate names it. */
const ONLINE_ACTOR = "system:online";

/** The shape the pure matching functions read. */
const entryOf = (row: BlacklistRow): BlacklistEntry => ({
	id: row.id,
	reason: row.reason,
	category: row.category,
	severity: row.severity,
	active: row.active,
	createdAt: row.createdAt,
	...(row.client === undefined ? {} : { client: row.client }),
	...(row.phone === undefined ? {} : { phone: row.phone }),
	...(row.email === undefined ? {} : { email: row.email }),
	...(row.name === undefined ? {} : { name: row.name }),
	...(row.expiresAt === undefined ? {} : { expiresAt: row.expiresAt }),
});

const problemsOf = (issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string[] => [
	...new Set(issues.map((i) => i.path.map(String).join(".") || "(entry)")),
];

/** What a booking path learns when the blacklist stops a staff booking (read by the memory appointment rules). */
export interface StaffStop {
	reason: "blocked" | "warning";
	detail: Record<string, unknown>;
}

export interface MemoryBlacklist {
	port: BlacklistPort;
	/**
	 * Asks the gate for a client being booked by staff. With `visit` (once the booking is made) an override that let it
	 * through is recorded for that visit; without it, nothing is written.
	 */
	staff(
		app: string,
		clientId: string | undefined,
		override: (Override & { actor: string }) | undefined,
		visit: string | undefined,
	): Promise<StaffStop | undefined>;
	/** The visitor's contact, asked before a request is stored; true when to be turned away. */
	online(
		app: string,
		contact: { name?: string | undefined; phone?: string | undefined; email?: string | undefined },
		channel: "callback" | "form" | "guide",
		subject?: string,
	): Promise<boolean>;
	state(): unknown;
}

export function createMemoryBlacklist(c: Cs, clock: () => number): MemoryBlacklist {
	const entries = new Map<string, BlacklistRow & { app: string }>();
	const events: (BlacklistEventRow & { app: string })[] = [];
	const rows = (app: string): (BlacklistRow & { app: string })[] =>
		[...entries.values()].filter((e) => e.app === app);
	const applies = (row: BlacklistRow, now: number): boolean =>
		row.active && (row.expiresAt === undefined || row.expiresAt > now);
	const active = (app: string): BlacklistRow[] => rows(app).filter((r) => r.active);
	const twinOf = (
		app: string,
		who: { client?: string | undefined; phone?: string | undefined; email?: string | undefined },
		except?: string,
	): string | undefined =>
		active(app).find(
			(e) =>
				e.id !== except &&
				((who.client !== undefined && e.client === who.client) ||
					(who.phone !== undefined && e.phone === who.phone) ||
					(who.email !== undefined && e.email === who.email)),
		)?.id;

	async function candidateOfClient(app: string, clientId: string): Promise<BlacklistCandidate> {
		const client = await c.clients.get(app, clientId);
		return {
			clients: [clientId],
			...(client === undefined ? {} : { name: client.name }),
			phones: [client?.contact?.phone, client?.guardian?.phone],
			emails: [client?.contact?.email, client?.guardian?.email],
		};
	}

	/** The clients an online contact is, by the phone or e-mail a client has on file (their guardian's included). */
	async function clientsByContact(app: string, candidate: BlacklistCandidate): Promise<string[]> {
		const found: string[] = [];
		for (const entry of active(app)) {
			if (entry.client === undefined) continue;
			const mine = await candidateOfClient(app, entry.client);
			const share = (a: ReadonlyArray<string | undefined>, b: ReadonlyArray<string | undefined>) =>
				a.some((x) => x !== undefined && b.includes(x));
			if (
				share(mine.phones ?? [], candidate.phones ?? []) ||
				share(mine.emails ?? [], candidate.emails ?? [])
			)
				found.push(entry.client);
		}
		return found;
	}

	const audit = (
		app: string,
		actor: string,
		action: string,
		entry: string,
		detail: Record<string, unknown>,
	) =>
		c.audit.insert({
			id: newId("e"),
			app,
			at: clock(),
			actor: { subject: actor, kind: "service" },
			action,
			target: { type: "blacklist", id: entry },
			detail,
		});

	const port: BlacklistPort = {
		async list(app, includeInactive) {
			const now = clock();
			return rows(app)
				.filter((r) => includeInactive || applies(r, now))
				.map(({ app: _a, ...r }) => r);
		},
		async get(app, id) {
			const row = entries.get(`${app}|${id}`);
			if (row === undefined) return undefined;
			const { app: _a, ...rest } = row;
			return rest;
		},
		async create(app, input, limit) {
			const parsed = blacklistInputSchema.safeParse(input);
			if (!parsed.success)
				throw new StoreRefused("invalid", { problems: problemsOf(parsed.error.issues) });
			const given = parsed.data;
			if (!severityAllowed(given.severity, limit)) throw new StoreRefused("severity_not_allowed");
			const now = clock();
			if (given.expiresAt !== undefined && given.expiresAt <= now)
				throw new StoreRefused("already_expired");
			if (given.client !== undefined) {
				const client = await c.clients.get(app, given.client);
				if (client === undefined || client.status === "deleted")
					throw new StoreRefused("unknown_client");
			}
			if (active(app).length >= MAX_ACTIVE_ENTRIES) throw new StoreRefused("limit");
			const twin = twinOf(app, given);
			if (twin !== undefined) throw new StoreRefused("exists", { id: twin });
			const id = newId("b");
			const actor = currentActor();
			entries.set(`${app}|${id}`, {
				id,
				app,
				...given,
				active: true,
				createdBy: actor,
				createdAt: now,
				updatedBy: actor,
				updatedAt: now,
				version: 1,
			});
			return { id };
		},
		async update(app, id, patch, clear, expectedVersion, limit) {
			const row = entries.get(`${app}|${id}`);
			if (row === undefined) throw new StoreRefused("not_found");
			if (expectedVersion !== undefined && row.version !== expectedVersion)
				throw new StoreRefused("stale");
			if (!severityAllowed(row.severity, limit)) throw new StoreRefused("severity_not_allowed");
			if (!clear.every((f) => (CLEARABLE_FIELDS as ReadonlyArray<string>).includes(f)))
				throw new StoreRefused("invalid");
			const parsed = blacklistPatchSchema.safeParse(patch);
			if (!parsed.success)
				throw new StoreRefused("invalid", { problems: problemsOf(parsed.error.issues) });
			const given = parsed.data;
			if (given.severity !== undefined && !severityAllowed(given.severity, limit))
				throw new StoreRefused("severity_not_allowed");
			const now = clock();
			if (given.expiresAt !== undefined && given.expiresAt <= now)
				throw new StoreRefused("already_expired");
			if (given.client !== undefined) {
				const client = await c.clients.get(app, given.client);
				if (client === undefined || client.status === "deleted")
					throw new StoreRefused("unknown_client");
			}
			const next: BlacklistRow & { app: string } = { ...row };
			for (const [key, value] of Object.entries(given))
				if (value !== undefined) Reflect.set(next, key, value);
			for (const field of clear) Reflect.deleteProperty(next, field);
			if (next.client === undefined && next.phone === undefined && next.email === undefined)
				throw new StoreRefused("identifier_required");
			const reactivating = given.active === true && !row.active;
			if (reactivating || next.active) {
				if (reactivating && active(app).length >= MAX_ACTIVE_ENTRIES)
					throw new StoreRefused("limit");
				const touchesIdentity =
					given.phone !== undefined || given.email !== undefined || given.client !== undefined;
				if ((reactivating || touchesIdentity) && twinOf(app, next, row.id) !== undefined)
					throw new StoreRefused("exists");
			}
			const changed = JSON.stringify(next) !== JSON.stringify(row);
			if (!changed) return { changed: false, version: row.version };
			const actor = currentActor();
			entries.set(`${app}|${id}`, {
				...next,
				updatedBy: actor,
				updatedAt: now,
				version: row.version + 1,
			});
			return { changed: true, version: row.version + 1 };
		},
		async remove(app, id) {
			if (!entries.delete(`${app}|${id}`)) throw new StoreRefused("not_found");
		},
		async check(app, who) {
			if (who.client !== undefined && (await c.clients.get(app, who.client)) === undefined)
				throw new StoreRefused("unknown_client");
			const own = who.client === undefined ? {} : await candidateOfClient(app, who.client);
			const hit = blacklistMatch(
				{
					...own,
					phones: [who.phone, ...(own.phones ?? [])],
					emails: [who.email, ...(own.emails ?? [])],
					...(who.name === undefined ? {} : { name: who.name }),
				},
				active(app).map(entryOf),
				clock(),
			);
			return hit === undefined
				? null
				: {
						entry: hit.entry.id,
						severity: hit.entry.severity,
						category: hit.entry.category,
						reason: hit.entry.reason,
						matchedBy: hit.via,
						matched: [...hit.matched],
						nameAgrees: hit.nameAgrees,
					};
		},
		async screen(app, channel, contact) {
			return online(app, contact, channel);
		},
		async events(app, query) {
			const before = query.before ?? Number.MAX_SAFE_INTEGER;
			const limit = Math.max(1, Math.min(200, Math.floor(query.limit ?? 100)));
			return events
				.filter(
					(e) =>
						e.app === app &&
						e.at < before &&
						(query.entry === undefined || e.entry === query.entry),
				)
				.sort((a, b) => b.at - a.at)
				.slice(0, limit)
				.map(({ app: _a, ...e }) => e);
		},
	};

	async function online(
		app: string,
		contact: { name?: string | undefined; phone?: string | undefined; email?: string | undefined },
		channel: "callback" | "form" | "guide",
		subject?: string,
	): Promise<boolean> {
		const candidate: BlacklistCandidate = {
			phones: [contact.phone],
			emails: [contact.email],
			...(contact.name === undefined ? {} : { name: contact.name }),
		};
		const list = active(app).map(entryOf);
		const known = { ...candidate, clients: await clientsByContact(app, candidate) };
		const decision = blacklistGate("online", blacklistMatch(known, list, clock()));
		if (decision.outcome !== "unavailable_online") return false;
		const { entry } = decision.hit;
		events.push({
			id: newId("v"),
			app,
			at: clock(),
			kind: "online_refused",
			entry: entry.id,
			severity: entry.severity,
			category: entry.category,
			matchedBy: decision.hit.via,
			channel,
			...(subject === undefined ? {} : { subject }),
		});
		await audit(app, ONLINE_ACTOR, "blacklist.hit", entry.id, { channel });
		return true;
	}

	return {
		port,
		online,
		async staff(app, clientId, override, visit) {
			if (clientId === undefined) return undefined;
			const hit = blacklistMatch(
				await candidateOfClient(app, clientId),
				active(app).map(entryOf),
				clock(),
			);
			const decision = blacklistGate("staff", hit, override);
			if (decision.outcome === "blocked" || decision.outcome === "warning") {
				const { entry } = decision.hit;
				return {
					reason: decision.outcome,
					detail: {
						blacklist: {
							entry: entry.id,
							severity: entry.severity,
							category: entry.category,
							reason: entry.reason,
							matchedBy: decision.hit.via,
							needs: decision.needs,
						},
					},
				};
			}
			if (decision.outcome === "overridden" && override !== undefined && visit !== undefined) {
				const { entry } = decision.hit;
				events.push({
					id: newId("v"),
					app,
					at: clock(),
					kind: "overridden",
					entry: entry.id,
					severity: entry.severity,
					category: entry.category,
					matchedBy: decision.hit.via,
					channel: "staff",
					actor: override.actor,
					authority: decision.override.authority,
					overrideReason: decision.override.reason,
					subject: visit,
				});
				await audit(app, override.actor, "blacklist.override", entry.id, {
					authority: decision.override.authority,
				});
			}
			return undefined;
		},
		state: () => [entries.size === 0 ? [] : [...entries.entries()], events],
	};
}
