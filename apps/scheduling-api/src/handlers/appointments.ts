import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { reaches } from "../authz/access";
import { appLink, parentLink } from "../authz/links";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { AppointmentRow } from "../store/types";
import { booking } from "./booking-gate";
import { appointmentGroupReach, appointmentView } from "./fields";
import { balances as packageBalances } from "./packages";
import { must, newId, paginate, stamps, writeTuples } from "./shared";

/** A package with this many sessions or fewer left tells the team. */
const LOW_SESSIONS = 2;
/** A deleted appointment can be restored for 30 days. */
const RECOVERY_MS = 30 * 86_400_000;

type C = Ctx<RouteSpec>;

export const links = (a: AppointmentRow) => [
	appLink("sched_appointment", a.id, a.app),
	parentLink("sched_appointment", a.id, "calendar", "sched_calendar", a.practitionerId),
];

/** Another live appointment of the same person, room or device that overlaps: the one thing two bookings may not share. */
export async function clash(
	ctx: C,
	candidate: Pick<
		AppointmentRow,
		"id" | "practitionerId" | "roomId" | "deviceId" | "start" | "end" | "kind"
	>,
): Promise<string | undefined> {
	const near = await ctx.deps.store.c.appointments.list(ctx.app, {
		range: { field: "start", gte: candidate.start - 24 * 3_600_000, lt: candidate.end },
	});
	return near.find(
		(o) =>
			o.id !== candidate.id &&
			o.deletedAt === undefined &&
			o.status !== "cancelled" &&
			o.end > candidate.start &&
			o.start < candidate.end &&
			(o.practitionerId === candidate.practitionerId ||
				(candidate.roomId !== undefined && o.roomId === candidate.roomId) ||
				(candidate.deviceId !== undefined && o.deviceId === candidate.deviceId)),
	)?.id;
}

export async function checkRefs(
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
	return appointmentView(row, {
		core: await ctx.canOn("appointments_view_core", "sched_appointment", row.id),
		money: await ctx.canOn("appointments_view_money", "sched_appointment", row.id),
	});
}

export const appointmentHandlers: HandlersOf<
	| "appointments.list"
	| "appointments.create"
	| "appointments.get"
	| "appointments.cancel"
	| "appointments.attendance"
	| "appointments.remove"
	| "appointments.restore"
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
					a.deletedAt === undefined &&
					reaches(ctx.reach, a.id) &&
					(ctx.query.clientId === undefined || a.clientId === ctx.query.clientId),
			)
			.sort((a, b) => a.start - b.start);
		const groups = await appointmentGroupReach(ctx);
		const page = paginate(rows, ctx.query.limit, ctx.query.cursor);
		return {
			...page,
			items: page.items.map((a) =>
				appointmentView(a, {
					core: reaches(groups.core, a.id),
					money: reaches(groups.money, a.id),
				}),
			),
		};
	},

	async "appointments.create"(ctx) {
		const b = ctx.body;
		if (b.end <= b.start)
			throw fail("invalid", "an appointment ends after it starts", { field: "end" });
		if (b.kind === "session" && b.clientId === undefined)
			throw fail("invalid", "a session needs a client", { field: "clientId" });
		if (b.kind === "group" && b.groupId === undefined)
			throw fail("invalid", "a group activity needs a group", { field: "groupId" });
		if (b.status === "requested" && b.kind !== "session")
			throw fail("invalid", "only a session waits for the client to confirm it", {
				field: "status",
			});
		if (
			b.priceCents !== undefined &&
			!(await ctx.canOn("appointments_create_money", "sched_calendar", b.practitionerId))
		)
			throw forbidden("not allowed to write this field group", { group: "money" });
		const core =
			b.clientId !== undefined ||
			b.groupId !== undefined ||
			b.roomId !== undefined ||
			b.deviceId !== undefined ||
			b.serviceId !== undefined ||
			b.packageId !== undefined ||
			b.note !== undefined;
		if (core && !(await ctx.canOn("appointments_create_core", "sched_calendar", b.practitionerId)))
			throw forbidden("not allowed to write this field group", { group: "core" });
		await checkRefs(ctx, b);
		const id = newId("a");
		const row: AppointmentRow = {
			id,
			app: ctx.app,
			kind: b.kind,
			status: b.status,
			remind: b.remind,
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
		const saved = await booking(ctx, b.override, () => ctx.deps.store.c.appointments.insert(row));
		await writeTuples(ctx, links(saved));
		await ctx.changed("appointment", "created", saved.id);
		// A requested appointment tells the client nothing until they confirm it.
		if (saved.clientId !== undefined && saved.status === "scheduled")
			await ctx.notify(
				"appointment.confirmed",
				{ kind: "client", clientId: saved.clientId },
				{ appointmentId: saved.id, start: saved.start },
				saved.id,
			);
		return appointmentOut(ctx, saved);
	},

	async "appointments.get"(ctx) {
		return appointmentOut(
			ctx,
			await must(ctx.deps.store.c.appointments, ctx.app, String(ctx.params.id), "appointment"),
		);
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
		if (row.status === "cancelled" || row.status === "requested")
			throw fail("conflict", "only a confirmed appointment has an attendance", {
				status: row.status,
			});
		const next: AppointmentRow = { ...row, status: ctx.body.status, updatedAt: ctx.now };
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

	async "appointments.remove"(ctx) {
		const row = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.id),
			"appointment",
		);
		if (row.deletedAt !== undefined) throw fail("conflict", "already deleted");
		const purgeAt = ctx.now + RECOVERY_MS;
		await ctx.deps.store.c.appointments.replace({
			...row,
			deletedAt: ctx.now,
			purgeAt,
			updatedAt: ctx.now,
		});
		await ctx.changed("appointment", "deleted", row.id);
		return { id: row.id, status: "deleted" as const, purgeAt };
	},

	async "appointments.restore"(ctx) {
		const row = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.id),
			"appointment",
		);
		if (row.deletedAt === undefined) throw fail("conflict", "the appointment is not deleted");
		const { deletedAt: _d, purgeAt: _p, ...kept } = row;
		const next: AppointmentRow = { ...kept, updatedAt: ctx.now };
		const other = await clash(ctx, next);
		if (other !== undefined)
			throw fail("conflict", "the person, room or device is booked then", { with: other });
		await ctx.deps.store.c.appointments.replace(next);
		await ctx.changed("appointment", "updated", row.id);
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
		const recorded = await ctx.deps.store.c.payments.insert({
			id: newId("y"),
			app: ctx.app,
			clientId: row.clientId,
			appointmentId: row.id,
			amountCents: ctx.body.amountCents,
			method: ctx.body.method,
			paidAt: ctx.now,
			recordedBy: ctx.subject,
			...stamps(ctx.now),
		});
		await ctx.changed("appointment", "updated", row.id);
		ctx.note({ amountCents: ctx.body.amountCents, method: ctx.body.method });
		await ctx.notify(
			"payment.recorded",
			{ kind: "team", permission: "payments_view" },
			{
				appointmentId: row.id,
				paymentId: recorded.id,
				clientId: row.clientId,
				amountCents: ctx.body.amountCents,
				what: "Programare",
			},
			`${row.id}:${paid}`,
		);
		return appointmentOut(ctx, next);
	},

	async "calendar.get"(ctx) {
		const s = ctx.deps.store.c;
		const { columns, from, to } = ctx.query;
		const inRange = (
			await s.appointments.list(ctx.app, { range: { field: "start", gte: from, lt: to } })
		).filter(
			(a) =>
				a.deletedAt === undefined &&
				a.status !== "cancelled" &&
				reaches(ctx.reach, a.practitionerId),
		);
		const groups = await appointmentGroupReach(ctx);
		const out = (a: AppointmentRow) =>
			appointmentView(a, { core: reaches(groups.core, a.id), money: reaches(groups.money, a.id) });
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
