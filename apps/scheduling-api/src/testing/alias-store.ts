import type { Collection, StorePort } from "../store/types";

/** A port whose every method takes the app first, shown the service's app id and handed the held one. */
function forApp<P extends object>(port: P, to: (app: string) => string): P {
	return new Proxy(port, {
		get(target, key) {
			const member: unknown = Reflect.get(target, key);
			return typeof member === "function"
				? (app: string, ...rest: unknown[]) => Reflect.apply(member, target, [to(app), ...rest])
				: member;
		},
	});
}

/**
 * A store that shows the service app ids it knows (`psizone`) while the wrapped store holds them under others
 * (`test-psizone-k3x9`). A persistent store can only drop tenants whose names say they are fixtures, so a world on it
 * lives in uniquely named tenants and the tests, which name `psizone` in their paths, never learn the difference.
 */
export function aliasApps(inner: StorePort, aliases: Readonly<Record<string, string>>): StorePort {
	const to = (app: string): string => aliases[app] ?? app;
	const back = new Map(Object.entries(aliases).map(([from, held]) => [held, from]));
	const from = (app: string): string => back.get(app) ?? app;
	const rowOut = <R extends { app: string }>(row: R): R => ({ ...row, app: from(row.app) });
	const rowIn = <R extends { app: string }>(row: R): R => ({ ...row, app: to(row.app) });

	/** `ownId`: the rows are the apps themselves, so their id is the app's too. */
	function collection<R extends { id: string; app: string }>(
		c: Collection<R>,
		ownId = false,
	): Collection<R> {
		const idIn = (id: string): string => (ownId ? to(id) : id);
		const out = (row: R): R => ({ ...rowOut(row), ...(ownId ? { id: from(row.id) } : {}) });
		const into = (row: R): R => ({ ...rowIn(row), ...(ownId ? { id: to(row.id) } : {}) });
		return {
			get: async (app, id) => {
				const row = await c.get(to(app), idIn(id));
				return row === undefined ? undefined : out(row);
			},
			list: async (app, query) => (await c.list(to(app), query)).map(out),
			insert: async (row) => out(await c.insert(into(row))),
			replace: (row) => c.replace(into(row)),
			remove: (app, id) => c.remove(to(app), idIn(id)),
		};
	}
	const c: StorePort["c"] = {
		apps: collection(inner.c.apps, true),
		members: collection(inner.c.members),
		roles: collection(inner.c.roles),
		people: collection(inner.c.people),
		rooms: collection(inner.c.rooms),
		devices: collection(inner.c.devices),
		groups: collection(inner.c.groups),
		services: collection(inner.c.services),
		clients: collection(inner.c.clients),
		appointments: collection(inner.c.appointments),
		packages: collection(inner.c.packages),
		payments: collection(inner.c.payments),
		roster: collection(inner.c.roster),
		leave: collection(inner.c.leave),
		reminders: collection(inner.c.reminders),
		records: collection(inner.c.records),
		files: collection(inner.c.files),
		notes: collection(inner.c.notes),
		audit: collection(inner.c.audit),
		definitions: collection(inner.c.definitions),
		imports: collection(inner.c.imports),
	};
	return {
		c,
		changes: {
			append: (app, event) => inner.changes.append(to(app), event),
			since: (app, seq) => inner.changes.since(to(app), seq),
			head: (app) => inner.changes.head(to(app)),
			subscribe: (app, after, onEvents, onError) =>
				inner.changes.subscribe(to(app), after, onEvents, onError),
		},
		appsOf: async (subject) =>
			(await inner.appsOf(subject)).map((m) => ({ ...m, app: from(m.app) })),
		visitor: {
			services: (app) => inner.visitor.services(to(app)),
			slots: (app, q) => inner.visitor.slots(to(app), q),
			hold: (app, input) => inner.visitor.hold(to(app), input),
			release: (app, reference, token) => inner.visitor.release(to(app), reference, token),
			submit: (app, input) => inner.visitor.submit(to(app), input),
			cancel: (app, reference, code) => inner.visitor.cancel(to(app), reference, code),
			callback: (app, input) => inner.visitor.callback(to(app), input),
			mine: (app, subject) => inner.visitor.mine(to(app), subject),
			cancelMine: (app, subject, id) => inner.visitor.cancelMine(to(app), subject, id),
		},
		requests: {
			list: (app, a, b) => inner.requests.list(to(app), a, b),
			pending: (app) => inner.requests.pending(to(app)),
			decide: (app, ref, decision, reason, actor) =>
				inner.requests.decide(to(app), ref, decision, reason, actor),
		},
		docs: forApp(inner.docs, to),
		blacklist: forApp(inner.blacklist, to),
		feedback: forApp(inner.feedback, to),
		keys: {
			keys: (app) => inner.keys.keys(to(app)),
			install: (app, version, wrapped) => inner.keys.install(to(app), version, wrapped),
		},
		reports: forApp(inner.reports, to),
		series: {
			create: async (app, rows) =>
				(await inner.series.create(to(app), rows.map(rowIn))).map(rowOut),
			replace: (app, rows) => inner.series.replace(to(app), rows.map(rowIn)),
			list: async (app, seriesId) => (await inner.series.list(to(app), seriesId)).map(rowOut),
		},
		keyed: forApp(inner.keyed, to),
		ping: () => inner.ping(),
	};
}
