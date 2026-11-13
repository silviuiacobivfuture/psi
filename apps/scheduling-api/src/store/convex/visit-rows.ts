import { z } from "zod";
import type { AppointmentRow } from "../types";
import { personApiId } from "./ids";

/** A deleted visit can be restored for 30 days: the wrapper (`RECOVERY_DAYS`) and the handlers agree. */
export const RECOVERY_MS = 30 * 86_400_000;

const Column = z.object({
	kind: z.enum(["practitioner", "device", "room", "group"]),
	id: z.string(),
});
const Meta = z.object({
	kind: z.enum(["session", "block", "group"]),
	practitioner: z.string(),
	group: z.string().optional(),
	service: z.string().optional(),
	cancelReason: z.string().optional(),
});
export type VisitMeta = z.infer<typeof Meta>;

/** A visit as `apiVisits:get` and `apiMoneyExtra:searchVisits` hand it out (the fields this adapter reads). */
export const VisitView = z.object({
	id: z.string(),
	client: z.string().optional(),
	column: Column,
	room: z.string().optional(),
	device: z.string().optional(),
	package: z.string().optional(),
	start: z.number(),
	end: z.number(),
	status: z.string(),
	attendance: z.enum(["pending", "attended", "absent"]),
	notes: z.string().optional(),
	priceMinor: z.number().optional(),
	amountPaidMinor: z.number().optional(),
	reminderSent: z.boolean(),
	clientConfirmed: z.boolean(),
	createdAt: z.number(),
	updatedAt: z.number(),
	deletedAt: z.number().optional(),
	version: z.number(),
	meta: Meta.optional(),
});
export type VisitViewT = z.infer<typeof VisitView>;

/** The Convex status/attendance of an API status; a cancelled visit keeps whatever attendance it had. */
export function attendanceOf(
	status: AppointmentRow["status"],
): "pending" | "attended" | "absent" | undefined {
	switch (status) {
		case "scheduled":
			return "pending";
		case "attended":
			return "attended";
		case "no_show":
			return "absent";
		case "cancelled":
			return undefined;
		default:
			return status satisfies never;
	}
}

function statusOf(v: VisitViewT): AppointmentRow["status"] {
	if (v.status === "cancelled") return "cancelled";
	return v.attendance === "attended"
		? "attended"
		: v.attendance === "absent"
			? "no_show"
			: "scheduled";
}

/** The facts the API keeps in `meta`: what a visit that predates it (imported) would have said. */
export function metaOf(v: VisitViewT): VisitMeta | undefined {
	if (v.meta !== undefined) return v.meta;
	if (v.column.kind === "practitioner")
		return {
			kind: v.client === undefined ? "block" : "session",
			practitioner: personApiId("practitioner", v.column.id),
		};
	return undefined;
}

export function paymentStatus(price: number, paid: number): "unpaid" | "partial" | "paid" {
	return price > 0 && paid >= price ? "paid" : paid > 0 ? "partial" : "unpaid";
}

/**
 * The API's appointment, or `undefined` for a visit it cannot say (a calendar column that is a room or a device with
 * none of the API's facts: nothing in the API creates one). Money is DERIVED from the visit's price and amount paid:
 * that is the single rule that keeps `appointments.replace(money)` and `payments.insert` from counting twice.
 */
export function toAppointment(app: string, v: VisitViewT): AppointmentRow | undefined {
	const meta = metaOf(v);
	if (meta === undefined) return undefined;
	const money =
		v.priceMinor === undefined && v.amountPaidMinor === undefined
			? undefined
			: (() => {
					const price = v.priceMinor ?? 0;
					const paid = v.amountPaidMinor ?? 0;
					return { priceCents: price, paidCents: paid, paymentStatus: paymentStatus(price, paid) };
				})();
	const groupId = meta.group ?? (v.column.kind === "group" ? v.column.id : undefined);
	return {
		id: v.id,
		app,
		kind: meta.kind,
		status: statusOf(v),
		practitionerId: meta.practitioner,
		...(v.client === undefined ? {} : { clientId: v.client }),
		...(groupId === undefined ? {} : { groupId }),
		...(v.room === undefined ? {} : { roomId: v.room }),
		...(v.device === undefined ? {} : { deviceId: v.device }),
		...(meta.service === undefined ? {} : { serviceId: meta.service }),
		...(v.package === undefined ? {} : { packageId: v.package }),
		start: v.start,
		end: v.end,
		...(v.notes === undefined ? {} : { note: v.notes }),
		...(meta.cancelReason === undefined ? {} : { cancelReason: meta.cancelReason }),
		...(money === undefined ? {} : { money }),
		...(v.deletedAt === undefined
			? {}
			: { deletedAt: v.deletedAt, purgeAt: v.deletedAt + RECOVERY_MS }),
		createdAt: v.createdAt,
		updatedAt: v.updatedAt,
	};
}

/** The facts of an API appointment that go in `meta`. */
export function metaFor(row: AppointmentRow): VisitMeta {
	return {
		kind: row.kind,
		practitioner: row.practitionerId,
		...(row.groupId === undefined ? {} : { group: row.groupId }),
		...(row.serviceId === undefined ? {} : { service: row.serviceId }),
		...(row.cancelReason === undefined ? {} : { cancelReason: row.cancelReason }),
	};
}
