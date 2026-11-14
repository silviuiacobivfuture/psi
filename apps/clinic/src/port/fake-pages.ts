import { CLIENT_PAGE_SIZE, type ClientPage, type ClinicPort } from "./port";

/** An offset into the whole answer, as text: the in-memory clinic's cursor (the service hands out its own). */
const offsetOf = (cursor: string | null): number => {
	const n = cursor === null ? 0 : Number.parseInt(cursor, 10);
	return Number.isInteger(n) && n >= 0 ? n : 0;
};

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
