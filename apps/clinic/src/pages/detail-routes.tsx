import { Skeleton, toastElement } from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app";
import type { Ctx } from "../lib/context";
import { refusalText } from "../lib/failures";
import { at } from "../lib/i18n";
import { signalsOf, sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import { type Appointment, PaymentMethodSchema } from "../port/schema";
import { DetailBody, type DetailData } from "./detail";

/** Everything the sheet shows about a visit already read: the client, their flags, packages and visits, the lists. */
async function load(ctx: Ctx, appointment: Appointment): Promise<DetailData> {
	const { clientId } = appointment;
	// The client, the flags on them, their packages and visits, and the lists the sheet names things from, all at once.
	const [client, flag, columns, services, packages, clientAppointments] = await Promise.all([
		clientId === null ? Promise.resolve(null) : ctx.port.client(ctx.app, clientId),
		clientId === null || !ctx.can.any("blacklist_view", "clients_view")
			? Promise.resolve(undefined)
			: ctx.port
					.clientFlags(ctx.app, [clientId])
					.then((all) => {
						const f = all[clientId];
						if (f === undefined) return undefined;
						return {
							blacklist: ctx.can.has("blacklist_view") ? f.blacklist : null,
							pinned:
								f.pinned?.category === "clinical" && !ctx.can.group("clinical") ? null : f.pinned,
						};
					})
					.catch(() => undefined),
		ctx.port.columns(ctx.app),
		ctx.port.services(ctx.app),
		clientId === null ? Promise.resolve([]) : ctx.port.packages(ctx.app, clientId),
		clientId === null ? Promise.resolve([]) : ctx.port.clientAppointments(ctx.app, clientId),
	]);
	return {
		appointment,
		flag,
		client,
		columns,
		service: services.find((s) => s.id === appointment.serviceId),
		pkg: packages.find((p) => p.id === appointment.packageId) ?? null,
		clientAppointments,
		app: ctx.app,
	};
}

async function sheetOf(ctx: Ctx, appointment: Appointment): Promise<string> {
	return await (
		<DetailBody
			d={await load(ctx, appointment)}
			locale={ctx.locale}
			rights={{
				edit: ctx.can.write("appointments_edit"),
				cancel: ctx.can.write("appointments_cancel"),
				pay: ctx.can.write("payments_create"),
			}}
		/>
	).toString();
}

export async function detailBody(ctx: Ctx, id: string): Promise<string | null> {
	const appointment = await ctx.port.appointment(ctx.app, id);
	return appointment === null ? null : await sheetOf(ctx, appointment);
}

const ReasonSignals = z.object({
	dtReason: z.string().trim().min(1).max(500),
	dtScope: z.enum(["this", "following", "all"]).default("this"),
});
const PaySignals = z.object({ dtPay: PaymentMethodSchema });

export function registerDetail(app: Hono<Env>): void {
	app.get("/calendar/appointment/:id", async (c) => {
		const ctx = c.var.ctx;
		const o = at(ctx.locale);
		// The visit itself is asked first, as ever: a refusal of the service is answered as it always was.
		const appointment = await ctx.port.appointment(ctx.app, c.req.param("id"));
		return sse(async (stream) => {
			if (appointment === null) {
				stream.patchElements(toastElement(m.error_title({}, o), m.dismiss({}, o)));
				return;
			}
			// The sheet opens now on a placeholder; what it shows about the visit (a handful of reads) follows.
			stream.patchSignals(JSON.stringify({ detail: true, editor: false }));
			stream.patchElements(
				await (
					<div id="detail-body" class="dt adm-stack" aria-busy="true">
						<Skeleton lines={5} label={m.loading({}, o)} />
					</div>
				).toString(),
			);
			try {
				stream.patchElements(await sheetOf(ctx, appointment));
			} catch (err) {
				if (!(err instanceof PortError)) console.error("[clinic] a visit's sheet failed:", err);
				stream.patchSignals(JSON.stringify({ detail: false }));
				stream.patchElements(
					toastElement(refusalText(err, ctx.locale) ?? m.error_title({}, o), m.dismiss({}, o)),
				);
				return;
			}
			stream.executeScript(
				"setTimeout(() => document.querySelector('#detail-body .adm-btn')?.focus(), 60)",
			);
		});
	});

	const act = (
		name: "attended" | "no-show" | "pay" | "cancel",
		run: (c: Context<Env>, ctx: Ctx, id: string) => Promise<string | null>,
		reload: boolean,
	): void => {
		app.post(`/appointments/:id/${name}`, async (c) => {
			const ctx = c.var.ctx;
			const o = at(ctx.locale);
			const id = c.req.param("id") ?? "";
			if ((await ctx.port.appointment(ctx.app, id)) === null) return c.notFound();
			return sse(async (stream) => {
				let toast: string | null;
				try {
					toast = await run(c, ctx, id);
				} catch (err) {
					const text =
						err instanceof PortError && err.code === "conflict" && err.reason !== "booking_paused"
							? m.ap_conflict_blocked({}, o)
							: (refusalText(err, ctx.locale) ?? m.error_title({}, o));
					stream.patchElements(toastElement(text, m.dismiss({}, o)));
					return;
				}
				if (toast === null) {
					stream.patchElements(toastElement(m.toast_invalid({}, o), m.dismiss({}, o)));
					return;
				}
				const body = await detailBody(ctx, id);
				if (body !== null) stream.patchElements(body);
				stream.patchElements(toastElement(toast, m.dismiss({}, o)));
				if (reload) stream.executeScript(`setTimeout(() => location.reload(), 700)`);
			});
		});
	};
	act(
		"attended",
		async (_c, ctx, id) => {
			await ctx.port.updateAppointment(ctx.app, id, { status: "attended" });
			return m.ap_marked_attended({}, at(ctx.locale));
		},
		true,
	);
	act(
		"no-show",
		async (_c, ctx, id) => {
			await ctx.port.updateAppointment(ctx.app, id, { status: "no-show" });
			return m.ap_marked_absent({}, at(ctx.locale));
		},
		true,
	);
	act(
		"pay",
		async (c, ctx, id) => {
			const s = await signalsOf(c, PaySignals);
			if (s === null) return null;
			await ctx.port.collectPayment(ctx.app, id, s.dtPay);
			return m.ap_collected({}, at(ctx.locale));
		},
		false,
	);
	act(
		"cancel",
		async (c, ctx, id) => {
			const s = await signalsOf(c, ReasonSignals);
			if (s === null) return null;
			const held = await ctx.port.appointment(ctx.app, id);
			// Many weeks at once, all or nothing; a lone appointment, or "this one", is the plain cancel.
			if (s.dtScope !== "this" && held?.seriesId != null) {
				await ctx.port.cancelSeries(ctx.app, id, s.dtReason, s.dtScope);
				return m.ap_series_cancelled({}, at(ctx.locale));
			}
			await ctx.port.cancelAppointment(ctx.app, id, s.dtReason);
			return m.ap_cancelled({}, at(ctx.locale));
		},
		true,
	);
}
