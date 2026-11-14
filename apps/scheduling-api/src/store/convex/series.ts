import { z } from "zod";
import { currentActor, currentOverride } from "../actor";
import type { SeriesPort } from "../ports";
import { type AppointmentRow, StoreRefused } from "../types";
import { answer, Refusal, type Rpc, unwrap } from "./rpc";
import { columnOf, editArgsOf } from "./visit-edit-args";
import { metaFor, toAppointment, VisitView } from "./visit-rows";

const Made = answer({ series: z.string(), ids: z.array(z.string()) });
const Members = z.union([answer({ visits: z.array(VisitView) }), Refusal]);
const Done = z.union([z.object({ ok: z.literal(true) }).passthrough(), Refusal]);

/**
 * Weekly series over `apiSeries`: each call is ONE mutation that reads and decides every occurrence before it writes
 * any, so a refusal (with the occurrences that caused it, `conflicts`) leaves nothing behind.
 */
export function seriesPort(rpc: Rpc): SeriesPort {
	const actor = (): { subject: string } => ({ subject: currentActor() });

	async function members(app: string, series: string): Promise<AppointmentRow[]> {
		const out = unwrap(await rpc.query("apiSeries:visits", { tenant: app, series }, Members));
		return out.visits.flatMap((v) => toAppointment(app, v) ?? []).sort((a, b) => a.start - b.start);
	}

	return {
		async create(app, rows) {
			const first = rows[0];
			if (first === undefined || rows.length < 2) throw new StoreRefused("invalid");
			const override = currentOverride();
			const made = unwrap(
				await rpc.mutation(
					"apiSeries:create",
					{
						tenant: app,
						actor: actor(),
						column: columnOf(first),
						occurrences: rows.map((r) => ({ start: r.start, end: r.end })),
						sessionType: first.serviceId ?? first.kind,
						meta: metaFor(first),
						...(first.status === "requested" ? { status: "requested" as const } : {}),
						...(first.clientId === undefined ? {} : { client: first.clientId }),
						...(first.roomId === undefined ? {} : { room: first.roomId }),
						...(first.deviceId === undefined ? {} : { device: first.deviceId }),
						...(first.packageId === undefined ? {} : { package: first.packageId }),
						...(first.note === undefined ? {} : { notes: first.note }),
						...(first.money === undefined ? {} : { priceMinor: first.money.priceCents }),
						...(override === undefined ? {} : { override }),
					},
					Made,
				),
			);
			return members(app, made.series);
		},

		async replace(app, rows) {
			const seriesId = rows[0]?.seriesId;
			if (seriesId === undefined) throw new StoreRefused("invalid");
			const listed = unwrap(
				await rpc.query("apiSeries:visits", { tenant: app, series: seriesId }, Members),
			).visits;
			const views = new Map(listed.map((v) => [v.id, v]));
			const held = new Map(
				listed.flatMap((v) => {
					const a = toAppointment(app, v);
					return a === undefined ? [] : [[a.id, a] as const];
				}),
			);
			const cancels = rows.filter((r) => r.status === "cancelled").length;
			if (cancels !== 0 && cancels !== rows.length) throw new StoreRefused("invalid");
			if (cancels > 0) {
				unwrap(
					await rpc.mutation(
						"apiSeries:cancelMany",
						{
							tenant: app,
							actor: actor(),
							items: rows.map((r) => ({ visit: r.id, meta: metaFor(r) })),
						},
						Done,
					),
				);
				return;
			}
			const override = currentOverride();
			const items = rows.flatMap((next) => {
				const cur = held.get(next.id);
				const view = views.get(next.id);
				if (cur === undefined || view === undefined) throw new StoreRefused("not_found");
				const edits = editArgsOf(view, cur, next, false);
				return edits === undefined
					? []
					: [{ visit: next.id, ...edits, ...(override === undefined ? {} : { override }) }];
			});
			if (items.length === 0) return;
			unwrap(
				await rpc.mutation("apiSeries:editMany", { tenant: app, actor: actor(), items }, Done),
			);
		},

		async list(app, seriesId) {
			return (await members(app, seriesId)).filter((a) => a.deletedAt === undefined);
		},
	};
}
