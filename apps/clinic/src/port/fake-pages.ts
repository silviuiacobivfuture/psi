import { nameMatches, orderPage } from "@psi/scheduling/clinic";
import { narrowedTo } from "./client-list";
import { offsetOf, offsetPage } from "./offset-page";
import {
	type AuditPage,
	type ClientPage,
	type ClinicPort,
	LIST_PAGE,
	type ListedClient,
	type Paged,
} from "./port";
import type { AppSlug, WebRequest } from "./schema";

/** The open or the handled requests, newest first, a page at a time. */
export function pagedRequests(port: Pick<ClinicPort, "requests">): ClinicPort["requestPage"] {
	return async (app, show, cursor): Promise<Paged<WebRequest>> =>
		offsetPage(
			[...(await port.requests(app))]
				.filter((r) => r.handled === (show === "handled"))
				.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
			cursor,
			LIST_PAGE,
		);
}

/** The clients on the blacklist now (their active entry), newest entry first, a page at a time. */
export function pagedBlacklist(
	port: Pick<ClinicPort, "clientSummaries" | "clients">,
): ClinicPort["blacklistPage"] {
	return async (app, cursor): Promise<Paged<ListedClient>> => {
		const [current, archived, summaries] = await Promise.all([
			port.clients(app, "current", ""),
			port.clients(app, "archived", ""),
			port.clientSummaries(app, "current", ""),
		]);
		const names = new Map([...current, ...archived].map((c) => [c.id, c.name]));
		const listed = summaries
			.flatMap((s) =>
				s.blacklist === null
					? []
					: [{ entry: s.blacklist, clientId: s.clientId, clientName: names.get(s.clientId) ?? "" }],
			)
			.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
		return offsetPage(listed, cursor, LIST_PAGE);
	};
}

/** The journal a page at a time over a port that answers it whole (newest first), within the days asked. */
export function pagedAudit(port: Pick<ClinicPort, "audit">): ClinicPort["auditPage"] {
	return async (app, window, cursor, limit): Promise<AuditPage> => {
		const start = offsetOf(cursor);
		const all = (await port.audit(app)).filter((e) => {
			const day = e.at.slice(0, 10);
			return (
				(window.from === undefined || day >= window.from) &&
				(window.to === undefined || day <= window.to)
			);
		});
		const events = all.slice(start, start + limit);
		const end = start + events.length;
		return { events, nextCursor: end < all.length ? String(end) : null };
	};
}

/**
 * The numbered client list over a port that answers it whole (the in-memory clinic): the same search, filters, order,
 * total and clamping as the service (the order and the search are the same code, `@psi/scheduling/clinic`). Creation
 * order is the clinic's own order of its clients; `holders` names the clients holding a package.
 */
export function pagedClients(
	port: Pick<ClinicPort, "clients" | "clientSummaries">,
	holders: (app: AppSlug) => ReadonlySet<string>,
): ClinicPort["clientPage"] {
	return async (app, ask): Promise<ClientPage> => {
		const [all, summaries] = await Promise.all([
			port.clients(app, ask.filter, ""),
			port.clientSummaries(app, ask.filter, ""),
		]);
		const by = new Map(summaries.map((s) => [s.clientId, s]));
		const holding = holders(app);
		const order = new Map(all.map((c, i) => [c.id, i]));
		const narrowed = narrowedTo(ask);
		const kept = all.filter(
			(c) =>
				nameMatches(c.name, ask.q) &&
				(narrowed === null || (c.practitionerId !== null && narrowed.includes(c.practitionerId))) &&
				(ask.flag !== "listed" || (by.get(c.id)?.blacklist ?? null) !== null) &&
				(ask.flag !== "unassigned" || c.practitionerId === null) &&
				(ask.pkg === null || holding.has(c.id) === (ask.pkg === "with")),
		);
		const cut = orderPage(
			kept.map((client) => {
				const last = by.get(client.id)?.lastVisit ?? null;
				return {
					id: client.id,
					name: client.name,
					createdAt: order.get(client.id) ?? 0,
					lastVisit: last === null ? null : Date.parse(`${last}T00:00:00Z`),
					client,
				};
			}),
			ask.sort,
			(ask.page - 1) * ask.size,
			ask.size,
		);
		const clients = cut.rows.map((r) => r.client);
		return {
			clients,
			summaries: clients.flatMap((c) => {
				const s = by.get(c.id);
				return s === undefined ? [] : [s];
			}),
			total: cut.total,
			page: Math.floor(cut.offset / ask.size) + 1,
		};
	};
}
