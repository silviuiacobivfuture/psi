import { z } from "zod";
import { currentActor, currentOverride } from "../actor";
import { type AppointmentRow, type Collection, type Query, StoreRefused } from "../types";
import { personRef } from "./ids";
import type { Rpc } from "./rpc";
import { answer, Refusal, unwrap } from "./rpc";
import { attendanceOf, metaFor, toAppointment, VisitView, type VisitViewT } from "./visit-rows";

const Id = answer({ id: z.string() });
/** What a write answers: the new version, and whether anything changed. */
const Version = z.union([
	z.object({
		ok: z.literal(true),
		version: z.number().optional(),
		changed: z.boolean().optional(),
	}),
	Refusal,
]);
const One = z.union([answer({ visit: VisitView }), Refusal]);
const Many = z.union([answer({ visits: z.array(VisitView) }), Refusal]);

type Column = { kind: "practitioner" | "group"; id: string };

/** The calendar column an API appointment sits in: its practitioner's, or its group's for a group activity. */
function columnOf(row: AppointmentRow): Column {
	if (row.kind === "group") {
		if (row.groupId === undefined) throw new StoreRefused("invalid");
		return { kind: "group", id: row.groupId };
	}
	const ref = personRef(row.practitionerId);
	if (ref?.kind !== "practitioner") throw new StoreRefused("unknown_practitioner");
	return { kind: "practitioner", id: ref.id };
}

const sameColumn = (a: Column, b: Column): boolean => a.kind === b.kind && a.id === b.id;

/**
 * Appointments over `apiVisits` and `apiVisitEdit` (+ `apiMoneyExtra` for the unwindowed search). `replace` DIFFS the
 * stored appointment against the new one. Everything an edit changes (the client, the package, the service, the price,
 * the note, the API's own facts, the confirmation and a move) goes in ONE mutation that decides every refusal before it
 * writes, so a refused edit leaves nothing behind. The restore before it, and the attendance, cancel and soft delete
 * after it, are each a different route's one change. The paid amount is derived from payments (see money.ts); the price
 * is the visit's and an edit may change it.
 */
export function appointmentCollection(rpc: Rpc): Collection<AppointmentRow> {
	const actor = (): { subject: string } => ({ subject: currentActor() });

	async function load(app: string, id: string): Promise<VisitViewT | undefined> {
		const out = await rpc.query("apiVisits:get", { tenant: app, visit: id }, One);
		if (!out.ok) {
			if (out.reason === "not_found") return undefined;
			throw new StoreRefused(out.reason);
		}
		return out.visit;
	}

	async function sync(
		app: string,
		current: VisitViewT,
		cur: AppointmentRow,
		next: AppointmentRow,
		force: boolean,
	): Promise<void> {
		const base = { tenant: app, actor: actor(), visit: current.id };
		const override = currentOverride();
		// Nothing a person did not ask for is cleared: a note, a room or a device is replaced, never taken away.
		for (const field of ["note", "roomId", "deviceId"] as const)
			if (cur[field] !== undefined && next[field] === undefined) throw new StoreRefused("invalid");
		if (cur.clientId !== undefined && next.clientId === undefined)
			throw new StoreRefused("invalid");
		if (cur.clientId === undefined && next.clientId !== undefined)
			throw new StoreRefused("invalid");
		if (cur.deletedAt !== undefined && next.deletedAt === undefined)
			unwrap(
				await rpc.mutation(
					"apiVisits:remove",
					{ ...base, action: "restore", now: next.updatedAt },
					Version,
				),
			);
		if (cur.status === "cancelled" && next.status !== "cancelled")
			throw new StoreRefused("not_allowed");
		// A confirmed appointment does not go back to waiting for the client.
		if (next.status === "requested" && cur.status !== "requested")
			throw new StoreRefused("not_allowed");

		const curColumn: Column | undefined =
			current.column.kind === "group" || current.column.kind === "practitioner"
				? { kind: current.column.kind, id: current.column.id }
				: undefined;
		const column = columnOf(next);
		const moved =
			next.start !== cur.start ||
			next.end !== cur.end ||
			next.roomId !== cur.roomId ||
			next.deviceId !== cur.deviceId ||
			curColumn === undefined ||
			!sameColumn(curColumn, column);

		// Every change of an edit goes in ONE mutation: it decides every refusal before it writes anything, so an edit
		// that is refused leaves nothing behind (a client moved, then a clash found, would not).
		const meta = metaFor(next);
		const metaChanged = force || JSON.stringify(meta) !== JSON.stringify(metaFor(cur));
		const price = next.money?.priceCents;
		const edits = {
			...(next.clientId !== cur.clientId && next.clientId !== undefined
				? { client: next.clientId }
				: {}),
			...(next.packageId !== cur.packageId ? { package: next.packageId ?? null } : {}),
			...(next.serviceId !== cur.serviceId && next.serviceId !== undefined
				? { sessionType: next.serviceId }
				: {}),
			...(price !== undefined && price !== cur.money?.priceCents ? { priceMinor: price } : {}),
			...(next.note !== cur.note && next.note !== undefined ? { notes: next.note } : {}),
			...(metaChanged ? { meta } : {}),
			...(cur.status === "requested" && next.status === "scheduled"
				? { confirm: true as const }
				: {}),
		};
		if (moved || Object.keys(edits).length > 0)
			unwrap(
				await rpc.mutation(
					"apiVisitEdit:edit",
					{
						...base,
						...edits,
						...(moved
							? {
									move: {
										start: next.start,
										end: next.end,
										column,
										...(next.roomId === undefined ? {} : { room: next.roomId }),
										...(next.deviceId === undefined ? {} : { device: next.deviceId }),
									},
								}
							: {}),
						...(override === undefined ? {} : { override }),
					},
					Version,
				),
			);

		const attendance = attendanceOf(next.status);
		if (next.status === "cancelled") {
			if (cur.status !== "cancelled") unwrap(await rpc.mutation("apiVisits:cancel", base, Version));
		} else if (
			attendance !== undefined &&
			attendance !== current.attendance &&
			next.status !== "requested"
		) {
			unwrap(await rpc.mutation("apiVisits:setAttendance", { ...base, attendance }, Version));
		}

		if (cur.deletedAt === undefined && next.deletedAt !== undefined)
			unwrap(
				await rpc.mutation(
					"apiVisits:remove",
					{ ...base, action: "delete", now: next.deletedAt },
					Version,
				),
			);
	}

	const collection: Collection<AppointmentRow> = {
		async get(app, id) {
			const view = await load(app, id);
			return view === undefined ? undefined : toAppointment(app, view);
		},

		async list(app, query?: Query<AppointmentRow>) {
			const eq = query?.eq ?? {};
			const range = query?.range?.field === "start" ? query.range : undefined;
			const practitioner = eq.practitionerId;
			const group = eq.groupId;
			const ref = practitioner === undefined ? undefined : personRef(practitioner);
			const out = await rpc.query(
				"apiMoneyExtra:searchVisits",
				{
					tenant: app,
					...(range?.gte === undefined ? {} : { from: range.gte }),
					...(range?.lt === undefined ? {} : { to: range.lt }),
					...(eq.clientId === undefined ? {} : { client: eq.clientId }),
					...(eq.roomId === undefined ? {} : { room: eq.roomId }),
					...(eq.deviceId === undefined ? {} : { device: eq.deviceId }),
					...(eq.packageId === undefined ? {} : { package: eq.packageId }),
					...(practitioner === undefined
						? {}
						: {
								practitioner,
								practitionerColumn: `practitioner:${ref?.kind === "practitioner" ? ref.id : ""}`,
							}),
					...(group === undefined ? {} : { group, groupColumn: `group:${group}` }),
					...(eq.serviceId === undefined ? {} : { service: eq.serviceId }),
				},
				Many,
			);
			const rows = unwrap(out).visits.flatMap((v) => toAppointment(app, v) ?? []);
			// Whatever the server did not narrow (status, kind, ...) and the range on any other field, here.
			return rows.filter(
				(row) =>
					Object.entries(eq).every(
						([k, want]) => want === undefined || Reflect.get(row, k) === want,
					) &&
					(query?.range === undefined ||
						((value) =>
							typeof value === "number" &&
							(query.range?.gte === undefined || value >= query.range.gte) &&
							(query.range?.lt === undefined || value < query.range.lt))(
							Reflect.get(row, query.range.field),
						)),
			);
		},

		async insert(row) {
			const column = columnOf(row);
			const held = currentOverride();
			const created = unwrap(
				await rpc.mutation(
					"apiVisits:create",
					{
						tenant: row.app,
						actor: actor(),
						column,
						start: row.start,
						end: row.end,
						sessionType: row.serviceId ?? row.kind,
						...(row.status === "requested" ? { status: "requested" as const } : {}),
						...(held === undefined ? {} : { override: held }),
						...(row.clientId === undefined ? {} : { client: row.clientId }),
						...(row.roomId === undefined ? {} : { room: row.roomId }),
						...(row.deviceId === undefined ? {} : { device: row.deviceId }),
						...(row.packageId === undefined ? {} : { package: row.packageId }),
						...(row.note === undefined ? {} : { notes: row.note }),
						...(row.money === undefined ? {} : { priceMinor: row.money.priceCents }),
						...(row.money === undefined || row.money.paidCents === 0
							? {}
							: { amountPaidMinor: row.money.paidCents }),
					},
					Id,
				),
			);
			const current = await load(row.app, created.id);
			// What the visit says before its meta is written is only the calendar's: the row's own meta stands in for it.
			const fresh =
				current === undefined
					? undefined
					: toAppointment(row.app, { ...current, meta: metaFor(row) });
			if (current === undefined || fresh === undefined) throw new StoreRefused("not_found");
			try {
				await sync(row.app, current, fresh, { ...row, id: created.id }, true);
			} catch (error) {
				// A visit made only half-way is hidden again (soft-deleted), and the refusal is the answer.
				await rpc
					.mutation(
						"apiVisits:remove",
						{ tenant: row.app, actor: actor(), visit: created.id, action: "delete" },
						Version,
					)
					.catch(() => undefined);
				throw error;
			}
			const saved = await collection.get(row.app, created.id);
			if (saved === undefined) throw new StoreRefused("not_found");
			return saved;
		},

		async replace(row) {
			const current = await load(row.app, row.id);
			const cur = current === undefined ? undefined : toAppointment(row.app, current);
			if (current === undefined || cur === undefined) return false;
			await sync(row.app, current, cur, row, false);
			return true;
		},

		/** Soft delete: the 30-day recovery is the store's, and the erasure job is what removes a row for good. */
		async remove(app, id) {
			const current = await load(app, id);
			if (current === undefined) return false;
			if (current.deletedAt === undefined)
				unwrap(
					await rpc.mutation(
						"apiVisits:remove",
						{ tenant: app, actor: actor(), visit: id, action: "delete" },
						Version,
					),
				);
			return true;
		},
	};
	return collection;
}
