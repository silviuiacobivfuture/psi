import type { HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { AppointmentRow } from "../store/types";
import { appointmentOut, checkRefs, clash, links } from "./appointments";
import { booking } from "./booking-gate";
import { must, writeTuples } from "./shared";

/** What the price and what was paid say about an appointment: the same rule the stores apply. */
const paymentStatus = (price: number, paid: number): "unpaid" | "partial" | "paid" =>
	price > 0 && paid >= price ? "paid" : paid > 0 ? "partial" : "unpaid";

/** What an edit of an appointment may carry: a field left out is left alone, `packageId: null` takes it out of its package. */
export interface AppointmentChanges {
	clientId?: string | undefined;
	serviceId?: string | undefined;
	practitionerId?: string | undefined;
	roomId?: string | undefined;
	deviceId?: string | undefined;
	note?: string | undefined;
	remind?: boolean | undefined;
	start?: number | undefined;
	end?: number | undefined;
	packageId?: string | null | undefined;
	priceCents?: number | undefined;
}

/** The appointment as it is after the changes; what was paid stays, whatever the price becomes. */
export function patchedRow(
	row: AppointmentRow,
	changes: AppointmentChanges,
	now: number,
): AppointmentRow {
	const { packageId, priceCents, ...plain } = changes;
	const { packageId: _held, ...unpackaged } = row;
	const paid = row.money?.paidCents ?? 0;
	return {
		...(packageId === null ? unpackaged : row),
		...Object.fromEntries(Object.entries(plain).filter(([, v]) => v !== undefined)),
		...(typeof packageId === "string" ? { packageId } : {}),
		...(priceCents === undefined
			? {}
			: { money: { priceCents, paidCents: paid, paymentStatus: paymentStatus(priceCents, paid) } }),
		updatedAt: now,
	};
}

/**
 * Changing an appointment, and confirming a requested one. An edit is all or nothing: every refusal (the field groups,
 * the references, the package of the client, the clash, the blacklist) is decided before the store writes, and the store
 * writes the whole edit in one step.
 */
export const appointmentEditHandlers: HandlersOf<"appointments.update" | "appointments.confirm"> = {
	async "appointments.update"(ctx) {
		const row = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.id),
			"appointment",
		);
		const { override, packageId, priceCents, ...b } = ctx.body;
		if (row.status === "cancelled")
			throw fail("conflict", "a cancelled appointment does not move", { status: row.status });
		if (row.deletedAt !== undefined)
			throw fail("conflict", "a deleted appointment does not change");

		const core =
			packageId !== undefined ||
			b.clientId !== undefined ||
			b.serviceId !== undefined ||
			b.remind !== undefined ||
			b.roomId !== undefined ||
			b.deviceId !== undefined ||
			b.note !== undefined;
		if (core && !(await ctx.canOn("appointments_edit_core", "sched_appointment", row.id)))
			throw forbidden("not allowed to write this field group", { group: "core" });
		if (
			priceCents !== undefined &&
			!(await ctx.canOn("appointments_edit_money", "sched_appointment", row.id))
		)
			throw forbidden("not allowed to write this field group", { group: "money" });
		const reassigns =
			(b.practitionerId !== undefined && b.practitionerId !== row.practitionerId) ||
			(b.roomId !== undefined && b.roomId !== row.roomId) ||
			(b.deviceId !== undefined && b.deviceId !== row.deviceId);
		if (reassigns && !(await ctx.canOn("appointments_assign", "sched_appointment", row.id)))
			throw forbidden("not allowed to change who or where", { permission: "appointments_assign" });
		// A client the caller may not see is not one they may book: the answer is the same as for one that is not there.
		if (
			b.clientId !== undefined &&
			b.clientId !== row.clientId &&
			!(await ctx.canOn("clients_view", "sched_client", b.clientId))
		)
			throw fail("invalid", "unknown reference", { field: "clientId" });
		if (b.clientId !== undefined && row.clientId === undefined)
			throw fail("invalid", "only a session has a client", { field: "clientId" });

		const next = patchedRow(row, { ...b, packageId, priceCents }, ctx.now);
		if (next.end <= next.start)
			throw fail("invalid", "an appointment ends after it starts", { field: "end" });
		await checkRefs(ctx, next);
		if (
			next.packageId !== undefined &&
			(b.clientId !== undefined || typeof packageId === "string")
		) {
			const pack = await ctx.deps.store.c.packages.get(ctx.app, next.packageId);
			if (pack !== undefined && pack.clientId !== next.clientId)
				throw fail("invalid", "the package is another client's", { field: "packageId" });
		}
		const other = await clash(ctx, next);
		if (other !== undefined)
			throw fail("conflict", "the person, room or device is booked then", { with: other });
		await booking(ctx, override, () => ctx.deps.store.c.appointments.replace(next));
		if (next.practitionerId !== row.practitionerId)
			await writeTuples(ctx, links(next), links(row).slice(1));
		await ctx.changed("appointment", "updated", row.id);
		// An edit is explicit: the audit event keeps which fields changed and, for a move, where it was.
		ctx.note({
			changed: [
				...Object.keys(b).filter((k) => b[k as keyof typeof b] !== undefined),
				...(packageId === undefined ? [] : ["packageId"]),
				...(priceCents === undefined ? [] : ["priceCents"]),
			],
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
				{ appointmentId: row.id, start: next.start, previousStart: row.start },
				`${row.id}:${next.start}:${next.practitionerId}`,
			);
		}
		if (next.clientId !== row.clientId) {
			// The appointment changed hands: the one who had it is told it is cancelled, the one who has it that it is theirs.
			if (row.clientId !== undefined)
				await ctx.notify(
					"appointment.cancelled",
					{ kind: "client", clientId: row.clientId },
					{ appointmentId: row.id, start: row.start },
					`${row.id}:released:${row.clientId}`,
				);
			if (next.clientId !== undefined && next.status !== "requested")
				await ctx.notify(
					"appointment.confirmed",
					{ kind: "client", clientId: next.clientId },
					{ appointmentId: row.id, start: next.start },
					`${row.id}:taken:${next.clientId}`,
				);
		}
		return appointmentOut(ctx, next);
	},

	async "appointments.confirm"(ctx) {
		const row = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.id),
			"appointment",
		);
		if (row.status !== "requested" || row.deletedAt !== undefined)
			throw fail("conflict", "only a requested appointment is confirmed", { status: row.status });
		const next: AppointmentRow = { ...row, status: "scheduled", updatedAt: ctx.now };
		await ctx.deps.store.c.appointments.replace(next);
		await ctx.changed("appointment", "updated", row.id);
		if (next.clientId !== undefined)
			await ctx.notify(
				"appointment.confirmed",
				{ kind: "client", clientId: next.clientId },
				{ appointmentId: row.id, start: next.start },
				row.id,
			);
		return appointmentOut(ctx, next);
	},
};
