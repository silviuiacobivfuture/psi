import { nameMatches, orderPage } from "@psi/scheduling/clinic";
import type { MemoryCollection } from "./memory-collection";
import type { BlacklistPort } from "./ports";
import type { AppointmentRow, ClientCollection, ClientRow, PackageRow } from "./types";

/**
 * The numbered client page over the in-memory store: the same candidates, filters, order and bounds as Convex's
 * `apiClientPage:page` (the order and the search are the same code, `@psi/scheduling/clinic`).
 */
export function memoryClientPage(
	clients: MemoryCollection<ClientRow>,
	appointments: MemoryCollection<AppointmentRow>,
	packages: MemoryCollection<PackageRow>,
	blacklist: () => BlacklistPort,
): ClientCollection["page"] {
	const came = (a: AppointmentRow, now: number): boolean =>
		a.deletedAt === undefined &&
		a.start < now &&
		(a.status === "scheduled" || a.status === "attended");
	return async (app, ask) => {
		let rows = (await clients.list(app)).filter((r) => r.status === ask.standing);
		if (ask.within !== undefined) {
			const within = new Set(ask.within);
			rows = rows.filter((r) => within.has(r.id));
		}
		if (ask.practitioners !== undefined) {
			const wanted = new Set(ask.practitioners);
			rows = rows.filter((r) => r.treating.some((p) => wanted.has(p)));
		}
		if (ask.flag === "listed") {
			const listed = new Set(
				(await blacklist().list(app, false)).flatMap((e) =>
					e.client === undefined || (e.expiresAt !== undefined && e.expiresAt <= ask.now)
						? []
						: [e.client],
				),
			);
			rows = rows.filter((r) => listed.has(r.id));
		}
		if (ask.flag === "unassigned") rows = rows.filter((r) => r.treating.length === 0);
		if (ask.packages !== undefined) {
			const holding = new Set((await packages.list(app)).map((p) => p.clientId));
			rows = rows.filter((r) => holding.has(r.id) === (ask.packages === "with"));
		}
		rows = rows.filter((r) => nameMatches(r.name, ask.q ?? ""));
		const visits = await appointments.list(app);
		const last = new Map<string, number>();
		for (const a of visits)
			if (a.clientId !== undefined && came(a, ask.now))
				last.set(a.clientId, Math.max(last.get(a.clientId) ?? 0, a.start));
		const cut = orderPage(
			rows.map((row) => ({
				id: row.id,
				name: row.name,
				createdAt: row.createdAt,
				lastVisit: last.get(row.id) ?? null,
				row,
			})),
			ask.sort,
			ask.offset,
			ask.size,
		);
		return {
			rows: cut.rows.map((r) => ({ row: r.row, lastVisit: r.lastVisit })),
			total: cut.total,
			offset: cut.offset,
		};
	};
}
