import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { reaches } from "../authz/access";
import { appLink, parentLink } from "../authz/links";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { AppointmentRow } from "../store/types";
import { appointmentView } from "./fields";
import { balances as packageBalances } from "./packages";
import { must, newId, paginate, stamps, writeTuples } from "./shared";

/** A package with this many sessions or fewer left tells the team. */
const LOW_SESSIONS = 2;

type C = Ctx<RouteSpec>;

const links = (a: AppointmentRow) => [
	appLink("sched_appointment", a.id, a.app),
	parentLink("sched_appointment", a.id, "calendar", "sched_calendar", a.practitionerId),
];

/** Another live appointment of the same person, room or device that overlaps: the one thing two bookings may not share. */
async function clash(
	ctx: C,
	candidate: Pick<
		AppointmentRow,
		"id" | "practitionerId" | "roomId" | "deviceId" | "start" | "end" | "kind"
	>,
): Promise<string | undefined> {
	if (candidate.kind === "block") return undefined;
	const near = await ctx.deps.store.c.appointments.list(ctx.app, {
		range: { field: "start", gte: candidate.start - 24 * 3_600_000, lt: candidate.end },
	});
	return near.find(
		(o) =>
			o.id !== candidate.id &&
			o.status !== "cancelled" &&
			o.end > candidate.start &&
			o.start < candidate.end &&
			(o.practitionerId === candidate.practitionerId ||
				(candidate.roomId !== undefined && o.roomId === candidate.roomId) ||
				(candidate.deviceId !== undefined && o.deviceId === candidate.deviceId)),
	)?.id;
}

async function checkRefs(
	ctx: C,
	a: Pick<
		AppointmentRow,
		"practitionerId" | "clientId" | "groupId" | "roomId" | "deviceId" | "serviceId" | "packageId"
	>,
): Promise<void> {
	const s = ctx.deps.store.c;
	const person = await s.people.get(ctx.app, a.practitionerId);
	if (person === undefined || !person.active)
		throw fail("invalid", "unknown person", { field: "practitionerId" });
	const refs: [string, string | undefined, () => Promise<unknown>][] = [
		["clientId", a.clientId, () => s.clients.get(ctx.app, a.clientId ?? "")],
		["groupId", a.groupId, () => s.groups.get(ctx.app, a.groupId ?? "")],
		["roomId", a.roomId, () => s.rooms.get(ctx.app, a.roomId ?? "")],
		["deviceId", a.deviceId, () => s.devices.get(ctx.app, a.deviceId ?? "")],
		["serviceId", a.serviceId, () => s.services.get(ctx.app, a.serviceId ?? "")],
		["packageId", a.packageId, () => s.packages.get(ctx.app, a.packageId ?? "")],
	];
	for (const [field, id, load] of refs)
		if (id !== undefined && (await load()) === undefined)
			throw fail("invalid", "unknown reference", { field });
}

export async function appointmentOut(ctx: C, row: AppointmentRow) {
	return appointmentView(
		row,
		await ctx.canOn("appointments_money_view", "sched_appointment", row.id),
	);
}

export const appointmentHandlers: HandlersOf<
	| "appointments.list"
	| "appointments.create"
	| "appointments.get"
	| "appointments.update"
	| "appointments.cancel"
	| "appointments.attendance"
	| "appointments.pay"
	| "calendar.get"
> = {
	async "appointments.list"(ctx) {
		const rows = (
			await ctx.deps.store.c.appointments.list(ctx.app, {
				range: { field: "start", gte: ctx.query.from, lt: ctx.query.to },
			})
		)
			.filter(
				(a) =>
					reaches(ctx.reach, a.id) &&
					(ctx.query.clientId === undefined || a.clientId === ctx.query.clientId),
			)
			.sort((a, b) => a.start - b.start);
		const money = await ctx.reachOf("appointments_money_view", "sched_appointment");
		const page = paginate(rows, ctx.query.limit, ctx.query.cursor);
		return { ...page, items: page.items.map((a) => appointmentView(a, reaches(money, a.id))) };
	},

	async "appointments.create"(ctx) {
		const b = ctx.body;
		if (b.end <= b.start)
			throw fail("invalid", "an appointment ends after it starts", { field: "end" });
		if (b.kind === "session" && b.clientId === undefined)
			throw fail("invalid", "a session needs a client", { field: "clientId" });
		if (b.kind === "group" && b.groupId === undefined)
			throw fail("invalid", "a group activity needs a group", { field: "groupId" });
		if (b.priceCents !== undefined && !(await ctx.canAll("appointments_money_edit")))
			throw forbidden("not allowed to write this field group", { group: "money" });
		await checkRefs(ctx, b);
		const id = newId("a");
		const row: AppointmentRow = {
			id,
			app: ctx.app,
			kind: b.kind,
			status: "scheduled",
			practitionerId: b.practitionerId,
			start: b.start,
			end: b.end,
			...(b.clientId === undefined ? {} : { clientId: b.clientId }),
			...(b.groupId === undefined ? {} : { groupId: b.groupId }),
			...(b.roomId === undefined ? {} : { roomId: b.roomId }),
			...(b.deviceId === undefined ? {} : { deviceId: b.deviceId }),
			...(b.serviceId === undefined ? {} : { serviceId: b.serviceId }),
			...(b.packageId === undefined ? {} : { packageId: b.packageId }),
			...(b.note === undefined ? {} : { note: b.note }),
			...(b.priceCents === undefined
				? {}
				: { money: { priceCents: b.priceCents, paidCents: 0, paymentStatus: "unpaid" as const } }),
			...stamps(ctx.now),
		};
		const other = await clash(ctx, row);
		if (other !== undefined)
			throw fail("conflict", "the person, room or device is booked then", { with: other });
		await ctx.deps.store.c.appointments.insert(row);
		await writeTuples(ctx, links(row));
		await ctx.changed("appointment", "created", id);
		if (row.clientId !== undefined)
			await ctx.notify(
				"appointment.confirmed",
				{ kind: "client", clientId: row.clientId },
				{ appointmentId: id, start: row.start },
				id,
			);
		return appointmentView(
			row,
			b.priceCents === undefined
				? false
				: await ctx.canOn("appointments_money_view", "sched_appointment", id),
		);
	},

	async "appointments.get"(ctx) {
		return appointmentOut(
			ctx,
			await must(ctx.deps.store.c.appointments, ctx.app, String(ctx.params.id), "appointment"),
		);
	},

	async "appointments.update"(ctx) {
		const row = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.id),
			"appointment",
		);
		const b = ctx.body;
		if (row.status === "cancelled")
			throw fail("conflict", "a cancelled appointment does not move", { status: row.status });
		const reassigns =
			(b.practitionerId !== undefined && b.practitionerId !== row.practitionerId) ||
			(b.roomId !== undefined && b.roomId !== row.roomId) ||
			(b.deviceId !== undefined && b.deviceId !== row.deviceId);
		if (reassigns && !(await ctx.canOn("appointments_assign", "sched_appointment", row.id)))
			throw forbidden("not allowed to change who or where", { permission: "appointments_assign" });
		const next: AppointmentRow = {
			...row,
			...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)),
			updatedAt: ctx.now,
		};
		if (next.end <= next.start)
			throw fail("invalid", "an appointment ends after it starts", { field: "end" });
		await checkRefs(ctx, next);
		const other = await clash(ctx, next);
		if (other !== undefined)
			throw fail("conflict", "the person, room or device is booked then", { with: other });
		await ctx.deps.store.c.appointments.replace(next);
		if (next.practitionerId !== row.practitionerId)
			await writeTuples(ctx, links(next), links(row).slice(1));
		await ctx.changed("appointment", "updated", row.id);
		// Moving anything is explicit: the audit event keeps what moved and where from.
		ctx.note({
			moved: Object.keys(b),
			from: { practitionerId: row.practitionerId, start: row.start },
		});
		if (
			next.clientId !== undefined &&
			(next.start !== row.start ||
				next.practitionerId !== row.practitionerId ||
				next.roomId !== row.roomId)
		) {
			await ctx.notify(
				"appointment.moved",
				{ kind: "client", clientId: next.clientId },
				{ appointmentId: row.id, start: next.start },
				`${row.id}:${next.start}:${next.practitionerId}`,
			);
		}
		return appointmentOut(ctx, next);
	},

	async "appointments.cancel"(ctx) {
		const row = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.id),
			"appointment",
		);
		if (row.status === "cancelled")
			throw fail("conflict", "already cancelled", { status: row.status });
		const next: AppointmentRow = {
			...row,
			status: "cancelled",
			cancelReason: ctx.body.reason,
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.appointments.replace(next);
		await ctx.changed("appointment", "updated", row.id);
		if (next.clientId !== undefined)
			await ctx.notify(
				"appointment.cancelled",
				{ kind: "client", clientId: next.clientId },
				{ appointmentId: row.id, start: row.start },
				row.id,
			);
		return appointmentOut(ctx, next);
	},

	async "appointments.attendance"(ctx) {
		const row = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.id),
			"appointment",
		);
		if (row.status === "cancelled")
			throw fail("conflict", "a cancelled appointment has no attendance", { status: row.status });
		const next: AppointmentRow = {
			...row,
			status: ctx.body.status === "scheduled" ? "scheduled" : ctx.body.status,
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.appointments.replace(next);
		await ctx.changed("appointment", "updated", row.id);
		if (next.status === "no_show")
			await ctx.notify(
				"attendance.no_show",
				{ kind: "team", permission: "appointments_edit" },
				{ appointmentId: row.id, practitionerId: row.practitionerId },
				row.id,
			);
		if (next.status === "attended" && next.packageId !== undefined) {
			const pkg = await ctx.deps.store.c.packages.get(ctx.app, next.packageId);
			const left =
				pkg === undefined ? undefined : (await packageBalances(ctx, pkg)).sessionsRemaining;
			if (left !== undefined && left <= LOW_SESSIONS)
				await ctx.notify(
					"package.low",
					{ kind: "team", permission: "packages_view" },
					{ packageId: next.packageId, sessionsRemaining: left },
					`${next.packageId}:${left}`,
				);
		}
		return appointmentOut(ctx, next);
	},

	async "appointments.pay"(ctx) {
		const row = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.id),
			"appointment",
		);
		if (row.clientId === undefined)
			throw fail("conflict", "only an appointment with a client takes a payment");
		const held = row.money ?? { priceCents: 0, paidCents: 0, paymentStatus: "unpaid" as const };
		const paid = held.paidCents + ctx.body.amountCents;
		const money = {
			priceCents: held.priceCents,
			paidCents: paid,
			paymentStatus:
				held.priceCents > 0 && paid >= held.priceCents ? ("paid" as const) : ("partial" as const),
		};
		const next: AppointmentRow = { ...row, money, updatedAt: ctx.now };
		await ctx.deps.store.c.appointments.replace(next);
		await ctx.deps.store.c.payments.insert({
			id: newId("y"),
			app: ctx.app,
			clientId: row.clientId,
			appointmentId: row.id,
			amountCents: ctx.body.amountCents,
			method: ctx.body.method,
			paidAt: ctx.now,
			...stamps(ctx.now),
		});
		await ctx.changed("appointment", "updated", row.id);
		ctx.note({ amountCents: ctx.body.amountCents, method: ctx.body.method });
		await ctx.notify(
			"payment.recorded",
			{ kind: "team", permission: "payments_view" },
			{ appointmentId: row.id, amountCents: ctx.body.amountCents },
			`${row.id}:${paid}`,
		);
		return appointmentOut(ctx, next);
	},

	async "calendar.get"(ctx) {
		const s = ctx.deps.store.c;
		const { columns, from, to } = ctx.query;
		const inRange = (
			await s.appointments.list(ctx.app, { range: { field: "start", gte: from, lt: to } })
		).filter((a) => a.status !== "cancelled" && reaches(ctx.reach, a.practitionerId));
		const money = await ctx.reachOf("appointments_money_view", "sched_appointment");
		const out = (a: AppointmentRow) => appointmentView(a, reaches(money, a.id));
		if (columns === "person") {
			const people = (await s.people.list(ctx.app))
				.filter((p) => p.active && reaches(ctx.reach, p.id))
				.sort((a, b) => a.displayName.localeCompare(b.displayName));
			return {
				columns: people.map((p) => ({
					id: p.id,
					name: p.displayName,
					appointments: inRange
						.filter((a) => a.practitionerId === p.id)
						.sort((a, b) => a.start - b.start)
						.map(out),
				})),
			};
		}
		const things = columns === "room" ? await s.rooms.list(ctx.app) : await s.devices.list(ctx.app);
		return {
			columns: things
				.filter((t) => t.active)
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((t) => ({
					id: t.id,
					name: t.name,
					appointments: inRange
						.filter((a) => (columns === "room" ? a.roomId : a.deviceId) === t.id)
						.sort((a, b) => a.start - b.start)
						.map(out),
				})),
		};
	},
};
