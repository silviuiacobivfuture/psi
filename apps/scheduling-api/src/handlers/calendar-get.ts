import { reaches } from "../authz/access";
import type { HandlersOf } from "../http/context";
import type { AppointmentRow } from "../store/types";
import { appointmentGroupReach, appointmentView } from "./fields";

type ColumnKind = "person" | "room" | "device";

/** The field of an appointment that places it in a column of the kind. */
const FIELD = { person: "practitionerId", room: "roomId", device: "deviceId" } as const;

const columnOf = (kind: ColumnKind, a: AppointmentRow): string | undefined => a[FIELD[kind]];

export const calendarHandlers: HandlersOf<"calendar.get"> = {
	/**
	 * The window's live visits on the caller's calendars, one column per person, room or device. With `ids` or `first`,
	 * only those columns, and the store is asked only their visits (an index per column): a week of one calendar, not
	 * the clinic's; the caller's other columns are named in `others`, without their visits.
	 */
	async "calendar.get"(ctx) {
		const s = ctx.deps.store.c;
		const { columns, from, to, ids, first } = ctx.query;
		const all =
			columns === "person"
				? (await s.people.list(ctx.app))
						.filter((p) => p.active && reaches(ctx.reach, p.id))
						.map((p) => ({ id: p.id, name: p.displayName }))
				: (columns === "room" ? await s.rooms.list(ctx.app) : await s.devices.list(ctx.app))
						.filter((t) => t.active)
						.map((t) => ({ id: t.id, name: t.name }));
		all.sort((a, b) => a.name.localeCompare(b.name));
		const wanted = ids === undefined ? undefined : new Set(ids);
		const asked =
			wanted !== undefined
				? all.filter((c) => wanted.has(c.id))
				: first !== undefined
					? all.slice(0, first)
					: all;
		const narrowed = wanted !== undefined || first !== undefined;
		const shown = new Set(asked.map((c) => c.id));
		const rows =
			narrowed && asked.length === 0
				? []
				: await s.appointments.list(ctx.app, {
						range: { field: "start", gte: from, lt: to },
						...(narrowed ? { oneOf: { field: FIELD[columns], values: [...shown] } } : {}),
					});
		const byColumn = new Map<string, AppointmentRow[]>();
		for (const a of rows) {
			const column = columnOf(columns, a);
			if (
				column === undefined ||
				!shown.has(column) ||
				a.deletedAt !== undefined ||
				a.status === "cancelled" ||
				!reaches(ctx.reach, a.practitionerId)
			)
				continue;
			const held = byColumn.get(column);
			if (held === undefined) byColumn.set(column, [a]);
			else held.push(a);
		}
		const groups = await appointmentGroupReach(ctx);
		const visitsOf = (id: string) =>
			(byColumn.get(id) ?? [])
				.sort((a, b) => a.start - b.start)
				.map((a) =>
					appointmentView(a, {
						core: reaches(groups.core, a.id),
						money: reaches(groups.money, a.id),
					}),
				);
		return {
			columns: asked.map((c) => ({ ...c, appointments: visitsOf(c.id) })),
			...(narrowed ? { others: all.filter((c) => !shown.has(c.id)) } : {}),
		};
	},
};
