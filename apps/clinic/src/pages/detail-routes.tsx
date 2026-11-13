import { toastElement } from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { signalsOf, sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import { PaymentMethodSchema } from "../port/schema";
import { DetailBody, type DetailData } from "./detail";

async function load(ctx: Ctx, id: string): Promise<DetailData | null> {
	const appointment = await ctx.port.appointment(ctx.app, id);
	if (appointment === null) return null;
	const [client, columns, services, packages, clientAppointments] = await Promise.all([
		appointment.clientId === null
			? Promise.resolve(null)
			: ctx.port.client(ctx.app, appointment.clientId),
		ctx.port.columns(ctx.app),
		ctx.port.services(ctx.app),
		appointment.clientId === null
			? Promise.resolve([])
			: ctx.port.packages(ctx.app, appointment.clientId),
		appointment.clientId === null
			? Promise.resolve([])
			: ctx.port.clientAppointments(ctx.app, appointment.clientId),
	]);
	return {
		appointment,
		client,
		columns,
		service: services.find((s) => s.id === appointment.serviceId),
		pkg: packages.find((p) => p.id === appointment.packageId) ?? null,
		clientAppointments,
		app: ctx.app,
	};
}

export async function detailBody(ctx: Ctx, id: string): Promise<string | null> {
	const d = await load(ctx, id);
	return d === null ? null : await (<DetailBody d={d} locale={ctx.locale} />).toString();
}

const ReasonSignals = z.object({ dtReason: z.string().trim().min(1).max(500) });
const PaySignals = z.object({ dtPay: PaymentMethodSchema });

export function registerDetail(app: Hono<Env>): void {
	app.get("/calendar/appointment/:id", async (c) => {
		const ctx = c.var.ctx;
		const body = await detailBody(ctx, c.req.param("id"));
		return sse(async (stream) => {
			if (body === null) {
				stream.patchElements(
					toastElement(m.error_title({}, at(ctx.locale)), m.dismiss({}, at(ctx.locale))),
				);
				return;
			}
			stream.patchElements(body);
			stream.patchSignals(JSON.stringify({ detail: true, editor: false }));
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
						err instanceof PortError && err.code === "conflict"
							? m.ap_conflict_blocked({}, o)
							: m.error_title({}, o);
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
			await ctx.port.cancelAppointment(ctx.app, id, s.dtReason);
			return m.ap_cancelled({}, at(ctx.locale));
		},
		true,
	);
}
