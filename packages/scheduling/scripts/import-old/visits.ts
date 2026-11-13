import type { PaymentMethod } from "../../src/clinic/money";
import {
	type Attendance,
	type CreditType,
	type VisitSpan,
	wallToInstant,
} from "../../src/clinic/visits";
import type { AppointmentStatus } from "../../src/domain/conflicts";
import { MINUTE_MS } from "../../src/domain/time";
import { money } from "./clients";
import { type ColumnPlace, columnFor, resourceFor } from "./mapping";
import type { VisitRow } from "./rows";
import type { Row } from "./source";
import {
	type Ctx,
	clean,
	cleanNote,
	clock,
	day,
	fingerprintOf,
	fold,
	reportExtraColumns,
	timestamp,
} from "./support";

const COLUMNS = new Set([
	"id",
	"client_id",
	"therapist_id",
	"room_id",
	"date",
	"start_time",
	"end_time",
	"duration",
	"session_type",
	"notes",
	"status",
	"created_at",
	"created_by",
	"reminder_sent",
	"client_confirmed",
	"price",
	"paid",
	"payment_method",
	"subscription_id",
	"therapist_notes",
	"amount_paid",
	"session_credit_type",
	"nfb_device_id",
	"attended",
]);

/** What the anomaly detectors need to know about one imported visit. */
export interface VisitFacts {
	id: number;
	span: VisitSpan;
	clientId: number | undefined;
	sessionType: string;
	date: string;
	clock: string;
	column: string;
	subscriptionId: number | undefined;
	creditType: CreditType | undefined;
	attendance: Attendance;
	status: AppointmentStatus;
}

export interface VisitsOut {
	rows: VisitRow[];
	facts: VisitFacts[];
}

function truthy(value: boolean | number | string | null | undefined): boolean | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	const t = fold(value);
	if (["true", "t", "1", "da", "yes"].includes(t)) return true;
	if (["false", "f", "0", "nu", "no"].includes(t)) return false;
	return null;
}

function method(ctx: Ctx, raw: string | null | undefined, ref: string): PaymentMethod | undefined {
	const t = fold(raw);
	if (t === "") return undefined;
	if (["cash", "numerar"].includes(t)) return "cash";
	if (t === "card") return "card";
	if (["transfer", "bank transfer", "op"].includes(t)) return "transfer";
	ctx.log.add("unknown_payment_method", "note", ref);
	return undefined;
}

function columnKey(c: ColumnPlace): string {
	return `${c.kind}:${c.legacyId}`;
}

export async function planVisits(
	ctx: Ctx,
	appointments: ReadonlyArray<Row<"appointments">>,
	known: {
		practitionerIds: ReadonlySet<number>;
		groupIds: ReadonlySet<number>;
		clientIds: ReadonlySet<number>;
		subscriptionIds: ReadonlySet<number>;
	},
): Promise<VisitsOut> {
	const out: VisitsOut = { rows: [], facts: [] };
	for (const a of appointments) {
		const ref = `appointments:${a.id}`;
		reportExtraColumns(ctx, "appointments", a.id, a, COLUMNS);

		if (a.therapist_id === null || a.therapist_id === undefined) {
			ctx.log.add("appointment_without_column", "skipped", ref);
			continue;
		}
		const column = columnFor(ctx.mapping, known.practitionerIds, known.groupIds, a.therapist_id);
		if (column === undefined) {
			ctx.log.add("orphan_appointment_column", "skipped", ref);
			continue;
		}
		const status = ((): AppointmentStatus | undefined => {
			const t = fold(a.status);
			if (t === "confirmed") return "confirmed";
			if (t === "cancelled" || t === "canceled") return "cancelled";
			return undefined;
		})();
		if (status === undefined) {
			ctx.log.add("unknown_appointment_status", "skipped", ref);
			continue;
		}
		const date = day(a.date);
		const startClock = clock(a.start_time);
		if (date === undefined || startClock === undefined) {
			ctx.log.add(
				date === undefined ? "bad_appointment_date" : "bad_appointment_time",
				"skipped",
				ref,
			);
			continue;
		}
		const start = wallToInstant(date, startClock, ctx.zone);
		if (!start.ok) {
			ctx.log.add(`appointment_${start.problem}`, "skipped", ref);
			continue;
		}
		const endClock = clock(a.end_time);
		const endWall = endClock === undefined ? undefined : wallToInstant(date, endClock, ctx.zone);
		const given =
			a.duration !== null && a.duration !== undefined && a.duration > 0
				? Math.round(a.duration)
				: undefined;
		const fromEnd =
			endWall?.ok === true ? Math.round((endWall.instant - start.instant) / MINUTE_MS) : undefined;
		const durationMinutes = given ?? fromEnd;
		if (durationMinutes === undefined || durationMinutes <= 0) {
			ctx.log.add("bad_duration", "skipped", ref);
			continue;
		}
		if (given !== undefined && fromEnd !== undefined && given !== fromEnd) {
			ctx.log.add("duration_differs_from_end_time", "note", ref);
		}
		const end = start.instant + durationMinutes * MINUTE_MS;

		let clientLegacy: string | undefined;
		let clientId: number | undefined;
		if (a.client_id !== null && a.client_id !== undefined) {
			if (known.clientIds.has(a.client_id)) {
				clientLegacy = `clients:${a.client_id}`;
				clientId = a.client_id;
			} else ctx.log.add("orphan_appointment_client", "note", ref);
		}
		// A room id may name a room or, in the mapping, a device (NFB 1): the visit uses what it names,
		// unless that is already its column.
		const viaRoom =
			a.room_id === null || a.room_id === undefined
				? undefined
				: resourceFor(ctx.mapping, "room", a.room_id);
		if (a.room_id !== null && a.room_id !== undefined && viaRoom === undefined) {
			ctx.log.add("orphan_appointment_room", "note", ref);
		}
		const viaDevice =
			a.nfb_device_id === null || a.nfb_device_id === undefined
				? undefined
				: resourceFor(ctx.mapping, "device", a.nfb_device_id);
		if (a.nfb_device_id !== null && a.nfb_device_id !== undefined && viaDevice?.kind !== "device") {
			ctx.log.add("orphan_appointment_device", "note", ref);
		}
		const other = (r: { legacyId: string } | undefined) =>
			r === undefined || r.legacyId === column.legacyId ? undefined : r.legacyId;
		const roomLegacy = viaRoom?.kind === "room" ? other(viaRoom) : undefined;
		const deviceLegacy =
			other(viaDevice?.kind === "device" ? viaDevice : undefined) ??
			(viaRoom?.kind === "device" ? other(viaRoom) : undefined);
		let packageLegacy: string | undefined;
		let subscriptionId: number | undefined;
		if (a.subscription_id !== null && a.subscription_id !== undefined) {
			if (known.subscriptionIds.has(a.subscription_id)) {
				packageLegacy = `client_subscriptions:${a.subscription_id}`;
				subscriptionId = a.subscription_id;
			} else ctx.log.add("orphan_appointment_subscription", "note", ref);
		}
		const credit = fold(a.session_credit_type);
		let creditType: CreditType | undefined;
		if (packageLegacy !== undefined) {
			if (credit === "base" || credit === "bonus") creditType = credit;
			else ctx.log.add("package_visit_without_credit_type", "note", ref);
		}

		const priceMinor = money(ctx, a.price, ref);
		let amountPaidMinor = money(ctx, a.amount_paid, ref);
		const paid = truthy(a.paid);
		if (amountPaidMinor === undefined && paid === true && priceMinor !== undefined) {
			amountPaidMinor = priceMinor;
			ctx.log.add("paid_flag_without_amount", "note", ref);
		}
		const attended = truthy(a.attended);
		const attendance: Attendance =
			attended === true ? "attended" : attended === false ? "absent" : "pending";
		const therapistNote = cleanNote(a.therapist_notes);
		const createdBy = clean(a.created_by);

		out.rows.push({
			legacyId: ref,
			fingerprint: await fingerprintOf(ctx, "appointments", a),
			column: { kind: column.kind, legacyId: column.legacyId },
			clientLegacy,
			roomLegacy,
			deviceLegacy,
			packageLegacy,
			start: start.instant,
			end,
			durationMinutes,
			sessionType: clean(a.session_type) ?? "unspecified",
			status,
			attendance,
			notes: cleanNote(a.notes),
			therapistNotes:
				therapistNote === undefined
					? undefined
					: await ctx.enc.encrypt(therapistNote, "visits.therapistNotes"),
			priceMinor,
			amountPaidMinor,
			paymentMethod: method(ctx, a.payment_method, ref),
			creditType,
			reminderSent: truthy(a.reminder_sent) ?? false,
			clientConfirmed: truthy(a.client_confirmed) ?? false,
			createdBy: createdBy === undefined ? "legacy" : `legacy:${createdBy.slice(0, 100)}`,
			createdAt: timestamp(a.created_at) ?? ctx.exportedAt,
		});
		const roomId = roomLegacy;
		const spanColumn =
			column.kind === "group"
				? { kind: "group" as const, id: column.legacyId }
				: { kind: column.kind, id: column.legacyId };
		out.facts.push({
			id: a.id,
			span: {
				id: ref,
				column: spanColumn,
				...(roomId === undefined ? {} : { room: roomId }),
				...(deviceLegacy === undefined ? {} : { device: deviceLegacy }),
				start: start.instant,
				end,
				status,
			},
			clientId,
			sessionType: clean(a.session_type) ?? "unspecified",
			date,
			clock: startClock,
			column: columnKey(column),
			subscriptionId,
			creditType,
			attendance,
			status,
		});
	}
	return out;
}
