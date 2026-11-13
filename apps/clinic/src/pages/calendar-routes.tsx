import { escapeHtml, toastElement } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { AppDeps, Env } from "../app";
import { at } from "../lib/i18n";
import { signalsOf, sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import { NewApptSignalsSchema } from "./calendar";

const minutesOf = (hhmm: string): number =>
	Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Writes of the calendar: the tap-to-create sheet posts its signals; the answer is SSE (toast, closed sheet, fresh grid link). */
export function registerCalendarWrites(app: Hono<Env>, _deps: AppDeps): void {
	app.post("/calendar/new", async (c) => {
		const ctx = c.var.ctx;
		const o = at(ctx.locale);
		const sig = await signalsOf(c, NewApptSignalsSchema);
		return sse(async (stream) => {
			if (sig === null) {
				stream.patchElements(toastElement(m.toast_invalid({}, o), m.dismiss({}, o)));
				return;
			}
			try {
				const a = await ctx.port.createAppointment(ctx.app, {
					date: sig.apDate,
					startMin: minutesOf(sig.apTime),
					columnId: sig.apCol,
					clientId: sig.apClient,
					serviceId: sig.apService,
				});
				stream.patchSignals(JSON.stringify({ newAppt: false }));
				stream.patchElements(toastElement(m.toast_created({}, o), m.dismiss({}, o)));
				stream.executeScript(`location.assign('/calendar?view=day&date=${escapeHtml(a.date)}')`);
			} catch (err) {
				const text =
					err instanceof PortError && err.code === "invalid"
						? m.toast_invalid({}, o)
						: m.error_title({}, o);
				stream.patchElements(toastElement(text, m.dismiss({}, o)));
			}
		});
	});
}
