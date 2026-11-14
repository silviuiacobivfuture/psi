import { atWallTime, weeklyOccurrences } from "@psi/scheduling/clinic";
import { MINUTE_MS, toLocal } from "@psi/scheduling/domain";
import type { RouteSpec, SeriesConflictType } from "@psi/scheduling-sdk/contract";
import { type Reach, reaches } from "../authz/access";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, forbidden, notFound } from "../http/errors";
import type { AppointmentRow } from "../store/types";
import { patchedRow } from "./appointment-edit";
import { checkNewAppointment, checkRefs, links, newAppointment } from "./appointments";
import { booking } from "./booking-gate";
import { appointmentGroupReach, appointmentView } from "./fields";
import { refuseStaffWhilePaused } from "./pause-gate";
import { diff, must, writeTuples } from "./shared";

type C = Ctx<RouteSpec>;

/** The appointments a change of a series may reach: still to be attended (scheduled or requested), and not deleted. */
const live = (a: AppointmentRow): boolean =>
	a.deletedAt === undefined && (a.status === "scheduled" || a.status === "requested");

/**
 * Which appointments of the series a change reaches. `this` is the one asked for; `following` is it and the ones after
 * it; `all` is every one still to come. Past ones, and any that has been attended, missed, cancelled or deleted, are
 * left alone; the one the person pointed at is always in scope when it can still be changed.
 */
function inScope(
	rows: readonly AppointmentRow[],
	at: AppointmentRow,
	scope: "this" | "following" | "all",
	now: number,
): AppointmentRow[] {
	switch (scope) {
		case "this":
			return live(at) ? [at] : [];
		case "following":
			return rows.filter(
				(a) => live(a) && a.start >= at.start && (a.id === at.id || a.start >= now),
			);
		case "all":
			return rows.filter((a) => live(a) && (a.id === at.id || a.start >= now));
		default:
			return scope satisfies never;
	}
}

/** The appointments as the caller may see them: identity always, the core and money groups with their own keys. */
async function viewAll(ctx: C, rows: readonly AppointmentRow[]) {
	const groups = await appointmentGroupReach(ctx);
	return rows.map((a) =>
		appointmentView(a, { core: reaches(groups.core, a.id), money: reaches(groups.money, a.id) }),
	);
}

async function seriesOf(ctx: C, seriesId: string): Promise<AppointmentRow[]> {
	const rows = await ctx.deps.store.series.list(ctx.app, seriesId);
	if (rows.length === 0) throw notFound("series");
	return rows;
}

/** Every appointment in scope must be one the caller holds the permission on, or none is changed. */
function everyReached(reach: Reach, targets: readonly AppointmentRow[], permission: string): void {
	if (targets.some((a) => !reaches(reach, a.id)))
		throw forbidden("not allowed to change every appointment in scope", { permission });
}

export const seriesHandlers: HandlersOf<
	"series.create" | "series.get" | "series.update" | "series.cancel"
> = {
	async "series.create"(ctx) {
		const { recurrence, ...b } = ctx.body;
		await checkNewAppointment(ctx, b);
		const app = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
		const plan = weeklyOccurrences({ start: b.start, end: b.end }, recurrence, app.timeZone);
		if (!plan.ok) {
			if (plan.reason === "no_such_time")
				throw fail("conflict", "a wall time of the series does not exist that day", {
					conflicts: plan.problems.map(
						(p): SeriesConflictType => ({ index: p.index, date: p.date, reason: p.reason }),
					),
				});
			throw fail(
				"invalid",
				plan.reason === "too_many"
					? "a series has at most 52 appointments"
					: "the series must end after its first appointment",
				{ field: "recurrence", reason: plan.reason },
			);
		}
		const drafts = plan.occurrences.map((o) => newAppointment(ctx, b, o));
		const lead = drafts[0];
		if (lead !== undefined) await refuseStaffWhilePaused(ctx, lead);
		const saved = await booking(ctx, b.override, () =>
			ctx.deps.store.series.create(ctx.app, drafts),
		);
		const first = saved[0];
		const seriesId = first?.seriesId;
		if (first === undefined || seriesId === undefined)
			throw fail("internal", "the series has no id");
		try {
			await writeTuples(ctx, saved.flatMap(links));
		} catch (error) {
			// A series whose appointments nobody may reach is worse than none: they are put away (soft-deleted).
			for (const a of saved) await ctx.deps.store.c.appointments.remove(ctx.app, a.id);
			throw error;
		}
		for (const a of saved) await ctx.changed("appointment", "created", a.id);
		// One message for the series, about its first appointment: fifty-two would be fifty-two e-mails.
		if (first.clientId !== undefined && first.status === "scheduled")
			await ctx.notify(
				"appointment.confirmed",
				{ kind: "client", clientId: first.clientId },
				{ appointmentId: first.id, start: first.start },
				seriesId,
			);
		ctx.auditTarget(seriesId);
		ctx.note({ count: saved.length, from: first.start, to: saved.at(-1)?.start });
		return { seriesId, items: await viewAll(ctx, saved) };
	},

	async "series.get"(ctx) {
		const seriesId = String(ctx.params.seriesId);
		const rows = (await seriesOf(ctx, seriesId)).filter((a) => reaches(ctx.reach, a.id));
		if (rows.length === 0) throw notFound("series");
		return { seriesId, items: await viewAll(ctx, rows) };
	},

	async "series.update"(ctx) {
		const seriesId = String(ctx.params.seriesId);
		const { occurrenceId, scope, startMin, durationMin, override, ...changes } = ctx.body;
		const rows = await seriesOf(ctx, seriesId);
		const at = rows.find((a) => a.id === occurrenceId);
		if (at === undefined) throw notFound("appointment");
		await ctx.authorize("appointments_edit", "sched_appointment", at.id);
		const targets = inScope(rows, at, scope, ctx.now);
		if (targets.length === 0)
			throw fail("conflict", "no appointment of the series can be changed", { scope });

		everyReached(
			await ctx.reachOf("appointments_edit", "sched_appointment"),
			targets,
			"appointments_edit",
		);
		const { packageId, priceCents, ...plain } = changes;
		const core =
			packageId !== undefined ||
			plain.clientId !== undefined ||
			plain.serviceId !== undefined ||
			plain.remind !== undefined ||
			plain.roomId !== undefined ||
			plain.deviceId !== undefined ||
			plain.note !== undefined;
		if (core) {
			const reached = await ctx.reachOf("appointments_edit_core", "sched_appointment");
			if (targets.some((a) => !reaches(reached, a.id)))
				throw forbidden("not allowed to write this field group", { group: "core" });
		}
		if (priceCents !== undefined) {
			const reached = await ctx.reachOf("appointments_edit_money", "sched_appointment");
			if (targets.some((a) => !reaches(reached, a.id)))
				throw forbidden("not allowed to write this field group", { group: "money" });
		}
		if (
			targets.some(
				(a) =>
					(plain.practitionerId !== undefined && plain.practitionerId !== a.practitionerId) ||
					(plain.roomId !== undefined && plain.roomId !== a.roomId) ||
					(plain.deviceId !== undefined && plain.deviceId !== a.deviceId),
			)
		)
			everyReached(
				await ctx.reachOf("appointments_assign", "sched_appointment"),
				targets,
				"appointments_assign",
			);
		if (
			plain.clientId !== undefined &&
			plain.clientId !== at.clientId &&
			!(await ctx.canOn("clients_view", "sched_client", plain.clientId))
		)
			throw fail("invalid", "unknown reference", { field: "clientId" });

		const app = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
		const moved: SeriesConflictType[] = [];
		const next = targets.map((a, index) => {
			let time: { start?: number; end?: number } = {};
			if (startMin !== undefined || durationMin !== undefined) {
				const wall = toLocal(a.start, app.timeZone);
				const start = atWallTime(a.start, startMin ?? wall.minutes, app.timeZone);
				if (start === undefined) {
					moved.push({ index, date: wall.date, reason: "no_such_time" });
					return a;
				}
				time = {
					start,
					end: start + (durationMin === undefined ? a.end - a.start : durationMin * MINUTE_MS),
				};
			}
			return patchedRow(a, { ...plain, ...time, packageId, priceCents }, ctx.now);
		});
		if (moved.length > 0)
			throw fail("conflict", "a wall time of the series does not exist that day", {
				conflicts: moved,
			});
		const sample = next[0];
		if (sample !== undefined) await checkRefs(ctx, sample);
		if (sample !== undefined) await refuseStaffWhilePaused(ctx, sample);
		await booking(ctx, override, () => ctx.deps.store.series.replace(ctx.app, next));
		const change = next.map((a, i) => {
			const was = targets[i];
			return was !== undefined && was.practitionerId !== a.practitionerId
				? diff(links(was), links(a))
				: { writes: [], deletes: [] };
		});
		await writeTuples(
			ctx,
			change.flatMap((c) => c.writes),
			change.flatMap((c) => c.deletes),
		);
		for (const a of next) await ctx.changed("appointment", "updated", a.id);
		ctx.auditTarget(seriesId);
		ctx.note({
			scope,
			count: next.length,
			changed: Object.keys(changes).filter((k) => changes[k as keyof typeof changes] !== undefined),
		});
		return { seriesId, items: await viewAll(ctx, await seriesOf(ctx, seriesId)) };
	},

	async "series.cancel"(ctx) {
		const seriesId = String(ctx.params.seriesId);
		const { occurrenceId, scope, reason } = ctx.body;
		const rows = await seriesOf(ctx, seriesId);
		const at = rows.find((a) => a.id === occurrenceId);
		if (at === undefined) throw notFound("appointment");
		await ctx.authorize("appointments_cancel", "sched_appointment", at.id);
		const targets = inScope(rows, at, scope, ctx.now);
		if (targets.length === 0)
			throw fail("conflict", "no appointment of the series can be cancelled", { scope });
		everyReached(
			await ctx.reachOf("appointments_cancel", "sched_appointment"),
			targets,
			"appointments_cancel",
		);
		const next = targets.map(
			(a): AppointmentRow => ({
				...a,
				status: "cancelled",
				cancelReason: reason,
				updatedAt: ctx.now,
			}),
		);
		await ctx.deps.store.series.replace(ctx.app, next);
		for (const a of next) await ctx.changed("appointment", "updated", a.id);
		const first = targets[0];
		// One message for the series, about the first appointment cancelled.
		if (first?.clientId !== undefined)
			await ctx.notify(
				"appointment.cancelled",
				{ kind: "client", clientId: first.clientId },
				{ appointmentId: first.id, start: first.start },
				`${seriesId}:${first.id}`,
			);
		ctx.auditTarget(seriesId);
		ctx.note({ scope, count: next.length });
		return { seriesId, items: await viewAll(ctx, await seriesOf(ctx, seriesId)) };
	},
};
