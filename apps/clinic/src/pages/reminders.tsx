import { Banner, EmptyState, escapeHtml, Icon, toastElement } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { addDays, dayLong, hhmm, IsoDay, todayIso } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { PortError, type ReminderItem } from "../port/port";
import type { AppSlug } from "../port/schema";

/** `0700 000 001` → `40700000001` (wa.me wants the international number, digits only). */
export function whatsappNumber(phone: string): string | null {
	const digits = phone.replace(/\D+/g, "");
	if (digits.length < 9) return null;
	if (digits.startsWith("00")) return digits.slice(2);
	if (digits.startsWith("0")) return `40${digits.slice(1)}`;
	return digits;
}

export function reminderText(item: ReminderItem, app: AppSlug, locale: Locale): string {
	const o = at(locale);
	const place =
		app === "psizone" ? m.reminder_place_psizone({}, o) : m.reminder_place_hemisync({}, o);
	return m.reminder_text(
		{
			name: item.client.name,
			date: dayLong(locale, item.appointment.date),
			time: hhmm(item.appointment.startMin),
			place,
		},
		o,
	);
}

/** One tap: a plain link to wa.me with the text prefilled — never a second confirmation inside the app. */
export function whatsappHref(item: ReminderItem, app: AppSlug, locale: Locale): string | null {
	const n = item.client.phone === null ? null : whatsappNumber(item.client.phone);
	return n === null
		? null
		: `https://wa.me/${n}?text=${encodeURIComponent(reminderText(item, app, locale))}`;
}

export function emailHref(item: ReminderItem, app: AppSlug, locale: Locale): string | null {
	if (item.client.email === null) return null;
	const subject = m.reminder_email_subject(
		{ date: dayLong(locale, item.appointment.date) },
		at(locale),
	);
	return `mailto:${item.client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reminderText(item, app, locale))}`;
}

function Row({
	item,
	app,
	locale,
	canSend,
}: {
	item: ReminderItem;
	app: AppSlug;
	locale: Locale;
	/** Holds reminders_send (and is not only viewing as someone else): otherwise there is nothing to press. */
	canSend: boolean;
}): JSX.Element {
	const o = at(locale);
	const wa = canSend ? whatsappHref(item, app, locale) : null;
	const mail = canSend ? emailHref(item, app, locale) : null;
	const id = item.appointment.id;
	const mark = { "data-on:click": `@post('/reminders/${id}/sent')` };
	return (
		<li class="adm-card reminder" id={`rem-${id}`} data-sent={item.sent ? "true" : "false"}>
			<div class="reminder__when">
				<strong>{hhmm(item.appointment.startMin)}</strong>
				<span class="adm-dot" style={`background:var(--cal-${item.column.colour})`} />
			</div>
			<div class="reminder__who">
				<strong>{item.client.name}</strong>
				<span class="adm-muted">
					{item.column.name} · {item.client.phone ?? m.reminder_no_contact({}, o)}
				</span>
			</div>
			{item.sent ? (
				<span id={`rem-state-${id}`} class="adm-pill adm-pill--attended">
					{m.reminder_sent({}, o)}
				</span>
			) : (
				<span id={`rem-state-${id}`} />
			)}
			<div class="adm-row">
				{wa === null ? null : (
					<a
						class="adm-btn adm-btn--primary"
						href={wa}
						target="_blank"
						rel="noopener noreferrer"
						{...mark}
					>
						<Icon name="chat" />
						{m.reminder_whatsapp({}, o)}
					</a>
				)}
				{mail === null ? null : (
					<a class="adm-btn" href={mail} {...mark}>
						<Icon name="mail" />
						{m.reminder_email({}, o)}
					</a>
				)}
			</div>
		</li>
	);
}

export async function renderReminders(
	ctx: Ctx,
	dateParam: string | undefined,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const date = IsoDay.catch(addDays(todayIso(), 1)).parse(dateParam);
	let items: ReadonlyArray<ReminderItem> = [];
	let failed = false;
	try {
		items = await ctx.port.reminders(ctx.app, date);
	} catch {
		failed = true;
	}
	return Page({
		ctx,
		current: "reminders",
		title: m.reminders_title({}, o),
		children: (
			<div class="adm-page">
				<div class="cal-bar">
					<a
						class="adm-iconbtn"
						href={`/reminders?date=${addDays(date, -1)}`}
						aria-label={m.prev({}, o)}
					>
						<Icon name="chevron-left" />
					</a>
					<h2 class="cal-bar__title" style="justify-content:center">
						{m.reminders_for({ date: dayLong(ctx.locale, date) }, o)}
					</h2>
					<a
						class="adm-iconbtn"
						href={`/reminders?date=${addDays(date, 1)}`}
						aria-label={m.next({}, o)}
					>
						<Icon name="chevron-right" />
					</a>
				</div>
				<p class="adm-muted">{m.reminder_hint({}, o)}</p>
				{failed ? (
					<Banner tone="error" icon="alert">
						<strong>{m.error_title({}, o)}</strong>
						<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
						<a class="adm-btn" href={`/reminders?date=${date}`}>
							{m.retry({}, o)}
						</a>
					</Banner>
				) : items.length === 0 ? (
					<EmptyState
						icon="chat"
						title={m.reminders_empty_title({}, o)}
						text={m.reminders_empty_text({}, o)}
					/>
				) : (
					<ul class="adm-stack" style="gap:var(--space-2);margin:0;padding:0;list-style:none">
						{items.map((i) => (
							<Row
								key={i.appointment.id}
								item={i}
								app={ctx.app}
								locale={ctx.locale}
								canSend={ctx.can.write("reminders_send")}
							/>
						))}
					</ul>
				)}
			</div>
		),
	});
}

export function registerReminders(app: Hono<Env>): void {
	app.get("/reminders", async (c) =>
		c.html(await renderReminders(c.var.ctx, c.req.query("date")), 200, {
			"cache-control": "private, no-store",
		}),
	);
	// The tap on WhatsApp or e-mail marks the reminder sent; the link itself has already opened.
	app.post("/reminders/:id/sent", async (c) => {
		const ctx = c.var.ctx;
		const id = c.req.param("id");
		try {
			await ctx.port.markReminderSent(ctx.app, id);
		} catch (err) {
			if (err instanceof PortError && err.code === "not-found") return c.notFound();
			throw err;
		}
		return sse((stream) => {
			const o = at(ctx.locale);
			stream.patchElements(
				`<span id="rem-state-${escapeHtml(id)}" class="adm-pill adm-pill--attended">${escapeHtml(m.reminder_sent({}, o))}</span>`,
			);
			stream.patchElements(toastElement(m.reminder_sent({}, o), m.dismiss({}, o)));
		});
	});
}
