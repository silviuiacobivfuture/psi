import { currentActor, currentOverride } from "./actor";
import type { MemoryBlacklist } from "./memory-blacklist";
import {
	type AppointmentRow,
	type Collection,
	type CollectionName,
	type PackageRow,
	type PaymentRow,
	type ReminderRow,
	type Rows,
	StoreRefused,
} from "./types";

type Collections = { [K in CollectionName]: Collection<Rows[K]> };

/** The blacklist's answer for a staff booking (see memory-blacklist.ts): a stop, or nothing. */
export type StaffGate = MemoryBlacklist["staff"];

/**
 * The rules the Convex wrappers enforce INSIDE the store, applied to the in-memory collections so the two adapters answer
 * the same (the contract suite runs on both): what refers to what, what may not overlap, what is never edited, and the
 * rules about money that make an appointment's amount paid the sum of its payments:
 * - an appointment's money is derived (price from the appointment, paid from its payments): `replace` cannot write it;
 * - an appointment is soft-deleted by `remove` (the erasure job is what removes it for good), and a deleted one changes
 *   only by being restored;
 * - a cancelled appointment does not come back, does not move, and a person, room or device is never in two live
 *   appointments at once (a group activity does not hold its practitioner: its column is the group).
 */
export const RECOVERY_MS = 30 * 86_400_000;

const paymentStatus = (price: number, paid: number): "unpaid" | "partial" | "paid" =>
	price > 0 && paid >= price ? "paid" : paid > 0 ? "partial" : "unpaid";

const money = (price: number, paid: number): NonNullable<AppointmentRow["money"]> => ({
	priceCents: price,
	paidCents: paid,
	paymentStatus: paymentStatus(price, paid),
});

function exclusives(a: AppointmentRow): string[] {
	return [
		...(a.kind === "group" ? [] : [`practitioner:${a.practitionerId}`]),
		...(a.roomId === undefined ? [] : [`room:${a.roomId}`]),
		...(a.deviceId === undefined ? [] : [`device:${a.deviceId}`]),
	];
}

const placeChanged = (a: AppointmentRow, b: AppointmentRow): boolean =>
	a.start !== b.start ||
	a.end !== b.end ||
	a.roomId !== b.roomId ||
	a.deviceId !== b.deviceId ||
	a.practitionerId !== b.practitionerId ||
	a.groupId !== b.groupId ||
	a.kind !== b.kind;

export function applyVisitRules(c: Collections, gate: StaffGate): void {
	const exists = async <R extends { id: string; app: string }>(
		col: Collection<R>,
		app: string,
		id: string | undefined,
		reason: string,
	): Promise<void> => {
		if (id !== undefined && (await col.get(app, id)) === undefined) throw new StoreRefused(reason);
	};

	async function checkRefs(a: AppointmentRow): Promise<void> {
		if (a.end <= a.start) throw new StoreRefused("end_not_after_start");
		await exists(c.clients, a.app, a.clientId, "unknown_client");
		await exists(c.rooms, a.app, a.roomId, "unknown_room");
		await exists(c.devices, a.app, a.deviceId, "unknown_device");
		await exists(c.packages, a.app, a.packageId, "unknown_package");
		if (a.kind === "group") {
			if (a.groupId === undefined) throw new StoreRefused("invalid");
			await exists(c.groups, a.app, a.groupId, "unknown_column");
		} else {
			const person = await c.people.get(a.app, a.practitionerId);
			if (person === undefined) throw new StoreRefused("unknown_column");
			if (person.kind !== "practitioner") throw new StoreRefused("unknown_practitioner");
		}
	}

	async function checkFree(a: AppointmentRow): Promise<void> {
		const wanted = new Set(exclusives(a));
		if (wanted.size === 0) return;
		for (const o of await c.appointments.list(a.app)) {
			if (o.id === a.id || o.deletedAt !== undefined || o.status === "cancelled") continue;
			if (o.end <= a.start || o.start >= a.end) continue;
			if (exclusives(o).some((key) => wanted.has(key))) throw new StoreRefused("overlaps");
		}
	}

	/** The blacklist's gate for a staff booking or move: the override in force (if any) is the request's. */
	async function stopOnBlacklist(app: string, clientId: string | undefined): Promise<void> {
		const held = currentOverride();
		const stop = await gate(
			app,
			clientId,
			held === undefined ? undefined : { ...held, actor: currentActor() },
			undefined,
		);
		if (stop !== undefined) throw new StoreRefused(stop.reason, stop.detail);
	}
	/** After the booking is made: an override that let it through is recorded for the visit. */
	async function noteOverride(
		app: string,
		clientId: string | undefined,
		visit: string,
	): Promise<void> {
		const held = currentOverride();
		if (held !== undefined) await gate(app, clientId, { ...held, actor: currentActor() }, visit);
	}

	const appointments = c.appointments;
	const insertAppointment = appointments.insert.bind(appointments);
	const replaceAppointment = appointments.replace.bind(appointments);
	appointments.insert = async (row) => {
		await checkRefs(row);
		await stopOnBlacklist(row.app, row.clientId);
		if (row.status !== "cancelled" && row.deletedAt === undefined) await checkFree(row);
		const { money: given, ...rest } = row;
		const saved = await insertAppointment({
			...rest,
			...(given === undefined ? {} : { money: money(given.priceCents, given.paidCents) }),
			...(row.deletedAt === undefined ? {} : { purgeAt: row.deletedAt + RECOVERY_MS }),
		});
		await noteOverride(row.app, row.clientId, row.id);
		return saved;
	};
	appointments.replace = async (row) => {
		const cur = await appointments.get(row.app, row.id);
		if (cur === undefined) return false;
		if (cur.deletedAt !== undefined && row.deletedAt !== undefined)
			throw new StoreRefused("not_found");
		if (row.clientId !== cur.clientId) throw new StoreRefused("invalid");
		for (const field of ["note", "packageId", "roomId", "deviceId"] as const)
			if (cur[field] !== undefined && row[field] === undefined) throw new StoreRefused("invalid");
		if (cur.status === "cancelled" && row.status !== "cancelled")
			throw new StoreRefused("not_allowed");
		const moved = placeChanged(cur, row);
		if (moved) {
			if (cur.status === "cancelled") throw new StoreRefused("not_allowed");
			await checkRefs(row);
			await stopOnBlacklist(row.app, row.clientId);
			await checkFree(row);
		} else if (row.note !== cur.note || row.packageId !== cur.packageId) {
			await checkRefs(row);
		}
		const { deletedAt, purgeAt: _purge, money: _money, ...rest } = row;
		const saved = await replaceAppointment({
			...rest,
			...(cur.money === undefined ? {} : { money: cur.money }),
			...(deletedAt === undefined ? {} : { deletedAt, purgeAt: deletedAt + RECOVERY_MS }),
		});
		if (moved) await noteOverride(row.app, row.clientId, row.id);
		return saved;
	};
	appointments.remove = async (app, id) => {
		const cur = await appointments.get(app, id);
		if (cur === undefined) return false;
		if (cur.deletedAt === undefined) {
			const at = Date.now();
			await replaceAppointment({ ...cur, deletedAt: at, purgeAt: at + RECOVERY_MS, updatedAt: at });
		}
		return true;
	};

	const packages = c.packages;
	const insertPackage = packages.insert.bind(packages);
	const replacePackage = packages.replace.bind(packages);
	const removePackage = packages.remove.bind(packages);
	const sound = (p: PackageRow): void => {
		if (p.discountCents > p.priceCents || p.sessions < 0 || p.bonus < 0)
			throw new StoreRefused("invalid");
	};
	packages.insert = async (row) => {
		await exists(c.clients, row.app, row.clientId, "unknown_client");
		sound(row);
		return insertPackage(row);
	};
	packages.replace = async (row) => {
		const cur = await packages.get(row.app, row.id);
		if (cur !== undefined && cur.clientId !== row.clientId) throw new StoreRefused("invalid");
		sound(row);
		return replacePackage(row);
	};
	packages.remove = async (app, id) => {
		if ((await packages.get(app, id)) === undefined) return false;
		const linked =
			(await c.appointments.list(app, { eq: { packageId: id } })).length > 0 ||
			(await c.payments.list(app, { eq: { packageId: id } })).length > 0;
		if (linked) throw new StoreRefused("in_use");
		return removePackage(app, id);
	};

	const payments = c.payments;
	const insertPayment = payments.insert.bind(payments);
	const replacePayment = payments.replace.bind(payments);
	const removePayment = payments.remove.bind(payments);
	const bumpPaid = async (app: string, appointmentId: string, by: number): Promise<void> => {
		const a = await appointments.get(app, appointmentId);
		if (a === undefined || a.deletedAt !== undefined) return;
		const price = a.money?.priceCents ?? 0;
		const paid = Math.max(0, (a.money?.paidCents ?? 0) + by);
		await replaceAppointment({ ...a, money: money(price, paid) });
	};
	payments.insert = async (row) => {
		await exists(c.clients, row.app, row.clientId, "unknown_client");
		if (row.packageId !== undefined) {
			const pack = await c.packages.get(row.app, row.packageId);
			if (pack === undefined || pack.clientId !== row.clientId)
				throw new StoreRefused("unknown_package");
		}
		if (row.appointmentId !== undefined) {
			const a = await appointments.get(row.app, row.appointmentId);
			if (a === undefined || a.deletedAt !== undefined || a.clientId !== row.clientId)
				throw new StoreRefused("unknown_visit");
		}
		if (!Number.isInteger(row.amountCents) || row.amountCents === 0)
			throw new StoreRefused("invalid");
		const saved = await insertPayment(row);
		if (row.appointmentId !== undefined)
			await bumpPaid(row.app, row.appointmentId, row.amountCents);
		return saved;
	};
	payments.replace = async (row: PaymentRow) => {
		const cur = await payments.get(row.app, row.id);
		if (cur === undefined) return false;
		if (JSON.stringify(cur) !== JSON.stringify(row)) throw new StoreRefused("not_allowed");
		return replacePayment(row);
	};
	payments.remove = async (app, id) => {
		const cur = await payments.get(app, id);
		if (cur === undefined) return false;
		if (cur.appointmentId !== undefined) await bumpPaid(app, cur.appointmentId, -cur.amountCents);
		return removePayment(app, id);
	};

	const reminders = c.reminders;
	const insertReminder = reminders.insert.bind(reminders);
	reminders.insert = async (row: ReminderRow) => {
		const a = await appointments.get(row.app, row.id);
		if (a === undefined || a.deletedAt !== undefined) throw new StoreRefused("not_found");
		return insertReminder(row);
	};
}
