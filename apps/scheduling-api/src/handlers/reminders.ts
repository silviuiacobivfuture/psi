import { startOfLocalDay } from "@psi/scheduling/domain";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { reaches } from "../authz/access";
import type { Ctx, Deps, HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import { m } from "../paraglide/messages.js";
import type { AppointmentRow, ClientRow } from "../store/types";
import { addDaysKey, must, paginate } from "./shared";

type C = Ctx<RouteSpec>;
type Locale = "ro" | "en";

/** The local date of an instant in the app's zone, `YYYY-MM-DD`. */
function localDate(instant: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

/**
 * A client is reminded of an appointment that is live, that they have confirmed (a requested one waits for them), and
 * whose reminder was not switched off.
 */
const remindable = (a: AppointmentRow): boolean =>
	a.deletedAt === undefined && a.status !== "cancelled" && a.status !== "requested" && a.remind;

async function target(ctx: C): Promise<{
	appointment: AppointmentRow;
	client: ClientRow;
	timeZone: string;
	placeName: string;
}> {
	const appointment = await must(
		ctx.deps.store.c.appointments,
		ctx.app,
		String(ctx.params.appointmentId),
		"appointment",
	);
	if (appointment.clientId === undefined || !remindable(appointment))
		throw fail("conflict", "only a live appointment with a client is reminded");
	const client = await must(ctx.deps.store.c.clients, ctx.app, appointment.clientId, "client");
	const app = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
	return { appointment, client, timeZone: app.timeZone, placeName: app.name };
}

function text(
	locale: Locale,
	key: "reminder_body" | "reminder_whatsapp" | "reminder_subject",
	name: string,
	instant: number,
	timeZone: string,
	place: string,
): string {
	const date = new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		timeZone,
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(instant);
	const time = new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
	}).format(instant);
	return m[key]({ name, date, time, place }, { locale });
}

/** A phone as wa.me wants it: digits only, Romanian national numbers (07…) with the country code. */
export function whatsappNumber(phone: string): string | undefined {
	const digits = phone.replace(/[^\d]/g, "");
	const full = phone.trim().startsWith("+")
		? digits
		: digits.startsWith("00")
			? digits.slice(2)
			: digits.startsWith("0")
				? `40${digits.slice(1)}`
				: digits;
	return full.length >= 8 && full.length <= 15 ? full : undefined;
}

/** Tomorrow's appointments that no one has marked sent or confirmed yet: the inbox badge. */
export async function pendingReminderCount(deps: Deps, app: string, now: number): Promise<number> {
	const row = await deps.store.c.apps.get(app, app);
	if (row === undefined) return 0;
	const date = addDaysKey(localDate(now, row.timeZone), 1);
	const due = (
		await deps.store.c.appointments.list(app, {
			range: {
				field: "start",
				gte: startOfLocalDay(date, row.timeZone),
				lt: startOfLocalDay(addDaysKey(date, 1), row.timeZone),
			},
		})
	).filter((a) => remindable(a) && a.clientId !== undefined && a.kind === "session");
	const states = new Map((await deps.store.c.reminders.list(app)).map((r) => [r.id, r.state]));
	return due.filter((a) => (states.get(a.id) ?? "pending") === "pending").length;
}

export const reminderHandlers: HandlersOf<
	| "reminders.list"
	| "reminders.mark"
	| "reminders.email"
	| "reminders.whatsapp"
	| "requests.list"
	| "requests.decide"
> = {
	async "reminders.list"(ctx) {
		const app = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
		const date = ctx.query.date ?? addDaysKey(localDate(ctx.now, app.timeZone), 1);
		const from = startOfLocalDay(date, app.timeZone);
		const to = startOfLocalDay(addDaysKey(date, 1), app.timeZone);
		const due = (
			await ctx.deps.store.c.appointments.list(ctx.app, {
				range: { field: "start", gte: from, lt: to },
			})
		)
			.filter((a) => remindable(a) && a.clientId !== undefined && a.kind === "session")
			.sort((a, b) => a.start - b.start);
		const states = new Map(
			(await ctx.deps.store.c.reminders.list(ctx.app)).map((r) => [r.id, r.state]),
		);
		const names = await ctx.reachOf("clients_view", "sched_client");
		const contacts = await ctx.reachOf("clients_view_contact", "sched_client");
		const items = [];
		for (const a of due) {
			const client =
				a.clientId === undefined
					? undefined
					: await ctx.deps.store.c.clients.get(ctx.app, a.clientId);
			const seen = client !== undefined && reaches(names, client.id);
			items.push({
				appointmentId: a.id,
				start: a.start,
				state: states.get(a.id) ?? ("pending" as const),
				...(seen && client !== undefined ? { clientId: client.id, clientName: client.name } : {}),
				...(client?.contact !== undefined && reaches(contacts, client.id)
					? { contact: client.contact }
					: {}),
			});
		}
		return { date, items };
	},

	async "reminders.mark"(ctx) {
		const appointment = await must(
			ctx.deps.store.c.appointments,
			ctx.app,
			String(ctx.params.appointmentId),
			"appointment",
		);
		const row = { id: appointment.id, app: ctx.app, state: ctx.body.state, updatedAt: ctx.now };
		if ((await ctx.deps.store.c.reminders.get(ctx.app, row.id)) === undefined)
			await ctx.deps.store.c.reminders.insert(row);
		else await ctx.deps.store.c.reminders.replace(row);
		ctx.auditTarget(appointment.id);
		ctx.note({ state: ctx.body.state });
		return { ok: true as const };
	},

	async "reminders.email"(ctx) {
		const mailer = ctx.deps.mailer;
		if (mailer === undefined) throw fail("unavailable", "mail is not configured");
		const { appointment, client, timeZone, placeName } = await target(ctx);
		if (!(await ctx.canOn("clients_view_contact", "sched_client", client.id)))
			throw forbidden("not allowed to see contact data", { group: "contact" });
		const to = client.contact?.email ?? client.guardian?.email;
		if (to === undefined) throw fail("conflict", "the client has no e-mail address");
		// Sent first, recorded after: a send that failed is never marked sent.
		await mailer.send({
			to,
			subject: text(
				ctx.body.locale,
				"reminder_subject",
				client.name,
				appointment.start,
				timeZone,
				placeName,
			),
			text: text(
				ctx.body.locale,
				"reminder_body",
				client.name,
				appointment.start,
				timeZone,
				placeName,
			),
		});
		const row = { id: appointment.id, app: ctx.app, state: "sent" as const, updatedAt: ctx.now };
		if ((await ctx.deps.store.c.reminders.get(ctx.app, row.id)) === undefined)
			await ctx.deps.store.c.reminders.insert(row);
		else await ctx.deps.store.c.reminders.replace(row);
		ctx.auditTarget(appointment.id);
		ctx.note({ channel: "email" });
		return { ok: true as const };
	},

	async "reminders.whatsapp"(ctx) {
		const { appointment, client, timeZone, placeName } = await target(ctx);
		if (!(await ctx.canOn("clients_view_contact", "sched_client", client.id)))
			throw forbidden("not allowed to see contact data", { group: "contact" });
		const number = whatsappNumber(client.contact?.phone ?? client.guardian?.phone ?? "");
		if (number === undefined) throw fail("conflict", "the client has no usable phone number");
		const body = text(
			ctx.query.locale,
			"reminder_whatsapp",
			client.name,
			appointment.start,
			timeZone,
			placeName,
		);
		return { url: `https://wa.me/${number}?text=${encodeURIComponent(body)}`, text: body };
	},

	async "requests.list"(ctx) {
		const rows = (await ctx.deps.store.requests.list(ctx.app, ctx.query.from, ctx.query.to)).sort(
			(a, b) => b.createdAt - a.createdAt,
		);
		return paginate(rows, ctx.query.limit, ctx.query.cursor);
	},

	async "requests.decide"(ctx) {
		const out = await ctx.deps.store.requests.decide(
			ctx.app,
			String(ctx.params.reference),
			ctx.body.decision,
			ctx.body.reason,
			ctx.subject,
		);
		if (!out.ok)
			throw out.reason === "not_allowed"
				? fail("conflict", "the request cannot be decided now")
				: fail("not_found", "request not found");
		await ctx.changed("request", "updated", String(ctx.params.reference));
		const to = { kind: "request", reference: String(ctx.params.reference) } as const;
		// Calling a callback back tells the visitor nothing: they were on the phone.
		if (ctx.body.decision === "handle") ctx.note({ decision: "handle" });
		else if (ctx.body.decision === "confirm")
			await ctx.notify("appointment.confirmed", to, { reference: to.reference }, to.reference);
		else
			await ctx.notify(
				"appointment.cancelled",
				to,
				{ reference: to.reference, by: "team" },
				to.reference,
			);
		ctx.note({ decision: ctx.body.decision });
		return { ok: true as const };
	},
};
