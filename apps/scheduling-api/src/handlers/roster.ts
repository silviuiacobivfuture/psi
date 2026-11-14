import { reaches } from "../authz/access";
import { tellScheduleChanged } from "../engagement/schedule-alert";
import type { HandlersOf } from "../http/context";
import { fail } from "../http/errors";
import type { LeaveRow, RosterRow } from "../store/types";
import { addDaysKey, must, newId, paginate, stamps } from "./shared";

const MAX_LEAVE_DAYS = 62;
const leaveOut = (l: LeaveRow) => ({
	id: l.id,
	personId: l.personId,
	from: l.from,
	to: l.to,
	kind: l.kind,
	status: l.status,
	...(l.decidedBy === undefined ? {} : { decidedBy: l.decidedBy }),
	createdAt: l.createdAt,
	updatedAt: l.updatedAt,
});
const rosterOut = (r: RosterRow) => ({
	id: r.id,
	personId: r.personId,
	date: r.date,
	kind: r.kind,
	...(r.start === undefined ? {} : { start: r.start }),
	...(r.end === undefined ? {} : { end: r.end }),
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
});

export const rosterHandlers: HandlersOf<
	"roster.get" | "roster.put" | "leave.list" | "leave.create" | "leave.decide"
> = {
	async "roster.get"(ctx) {
		const { from, to } = ctx.query;
		return {
			items: (await ctx.deps.store.c.roster.list(ctx.app))
				.filter((r) => r.date >= from && r.date <= to && reaches(ctx.reach, r.personId))
				.sort((a, b) => a.date.localeCompare(b.date) || a.personId.localeCompare(b.personId))
				.map(rosterOut),
		};
	},

	async "roster.put"(ctx) {
		const personId = String(ctx.params.id);
		const date = String(ctx.params.date);
		await must(ctx.deps.store.c.people, ctx.app, personId, "person");
		const { start, end, kind } = ctx.body;
		if (kind === "work" && (start === undefined || end === undefined || end <= start))
			throw fail("invalid", "a work day has hours", { field: "end" });
		const id = `${personId}_${date}`;
		const held = await ctx.deps.store.c.roster.get(ctx.app, id);
		const row: RosterRow = {
			id,
			app: ctx.app,
			personId,
			date,
			kind,
			...(kind === "work" && start !== undefined && end !== undefined ? { start, end } : {}),
			createdAt: held?.createdAt ?? ctx.now,
			updatedAt: ctx.now,
		};
		if (held === undefined) await ctx.deps.store.c.roster.insert(row);
		else await ctx.deps.store.c.roster.replace(row);
		await ctx.changed("roster", held === undefined ? "created" : "updated", id);
		await tellScheduleChanged(
			ctx,
			personId,
			date,
			kind === "work" ? "hours" : kind === "free" ? "day_off" : "leave",
		);
		return rosterOut(row);
	},

	async "leave.list"(ctx) {
		const rows = (await ctx.deps.store.c.leave.list(ctx.app))
			.filter((l) => reaches(ctx.reach, l.personId))
			.sort((a, b) => b.from.localeCompare(a.from));
		const page = paginate(rows, ctx.query.limit, ctx.query.cursor);
		return { ...page, items: page.items.map(leaveOut) };
	},

	async "leave.create"(ctx) {
		const { personId, from, to, kind } = ctx.body;
		await must(ctx.deps.store.c.people, ctx.app, personId, "person");
		if (to < from) throw fail("invalid", "leave ends after it starts", { field: "to" });
		if (addDaysKey(from, MAX_LEAVE_DAYS) < to)
			throw fail("invalid", `at most ${MAX_LEAVE_DAYS} days at once`, { field: "to" });
		const draft: LeaveRow = {
			id: newId("l"),
			app: ctx.app,
			personId,
			from,
			to,
			kind,
			status: "pending",
			...stamps(ctx.now),
		};
		const row = await ctx.deps.store.c.leave.insert(draft);
		await ctx.notify(
			"leave.requested",
			{ kind: "team", permission: "leave_approve" },
			{ leaveId: row.id, personId, from, to },
			row.id,
		);
		return leaveOut(row);
	},

	async "leave.decide"(ctx) {
		const row = await must(ctx.deps.store.c.leave, ctx.app, String(ctx.params.id), "leave request");
		await ctx.authorize("leave_approve", "sched_calendar", row.personId);
		if (row.status !== "pending") throw fail("conflict", "already decided", { status: row.status });
		const next: LeaveRow = {
			...row,
			status: ctx.body.decision,
			decidedBy: ctx.subject,
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.leave.replace(next);
		if (next.status === "approved") {
			// Approved leave lands on the roster, day by day, as leave: the roster and the request cannot disagree.
			for (let date = row.from; date <= row.to; date = addDaysKey(date, 1)) {
				const id = `${row.personId}_${date}`;
				const held = await ctx.deps.store.c.roster.get(ctx.app, id);
				const day: RosterRow = {
					id,
					app: ctx.app,
					personId: row.personId,
					date,
					kind: row.kind === "co" ? "leave_co" : "leave_cm",
					createdAt: held?.createdAt ?? ctx.now,
					updatedAt: ctx.now,
				};
				if (held === undefined) await ctx.deps.store.c.roster.insert(day);
				else await ctx.deps.store.c.roster.replace(day);
			}
			await ctx.changed("roster", "updated", row.personId);
			await tellScheduleChanged(ctx, row.personId, row.from, "leave");
		}
		const person = await ctx.deps.store.c.people.get(ctx.app, row.personId);
		if (person?.subject !== undefined)
			await ctx.notify(
				"leave.decided",
				{ kind: "person", subject: person.subject },
				{ leaveId: row.id, decision: next.status },
				row.id,
			);
		return leaveOut(next);
	},
};
