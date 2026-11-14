import { offsetOf, offsetPage } from "./offset-page";
import {
	type AuditPage,
	CLIENT_PAGE_SIZE,
	type ClientPage,
	type ClinicPort,
	LIST_PAGE,
	type ListedClient,
	type Paged,
} from "./port";
import type { WebRequest } from "./schema";

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
 * The client list a page at a time over a port that answers it whole (the in-memory clinic): the same pages, sizes and
 * cursors' meaning (absent on the last page) a screen sees from the service.
 */
export function pagedClients(
	port: Pick<ClinicPort, "clients" | "clientSummaries">,
): ClinicPort["clientPage"] {
	return async (app, filter, query, cursor): Promise<ClientPage> => {
		const start = offsetOf(cursor);
		const [all, summaries] = await Promise.all([
			port.clients(app, filter, query),
			port.clientSummaries(app, filter, query),
		]);
		const clients = all.slice(start, start + CLIENT_PAGE_SIZE);
		const ids = new Set(clients.map((c) => c.id));
		const end = start + clients.length;
		return {
			clients,
			summaries: summaries.filter((s) => ids.has(s.clientId)),
			nextCursor: end < all.length ? String(end) : null,
		};
	};
}
