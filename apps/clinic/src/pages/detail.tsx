import { Icon, StatusPill } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ledger } from "../domain/ledger";
import { CURRENCY, formatAmount } from "../domain/money";
import { packageUsage, paidBani } from "../domain/usage";
import { dayLong, hhmm, todayIso } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import type { ReminderItem } from "../port/port";
import type { Appointment, Client, Column, Package, Service } from "../port/schema";
import { initials } from "./appt-tile";
import { emailHref, whatsappHref } from "./reminders";

export interface DetailData {
	appointment: Appointment;
	client: Client | null;
	columns: ReadonlyArray<Column>;
	service: Service | undefined;
	pkg: Package | null;
	clientAppointments: ReadonlyArray<Appointment>;
	app: "psizone" | "hemisync";
}

const act = (id: string, what: string): string => `@post('/appointments/${id}/${what}')`;

/** One appointment: who, when, where, what it draws from, whether it is paid — and what you can do next. */
/** What the person may do with the appointment: its actions are offered only for these. */
export interface DetailRights {
	edit: boolean;
	cancel: boolean;
	pay: boolean;
}

export function DetailBody({
	d,
	locale,
	rights,
}: {
	d: DetailData;
	locale: Locale;
	rights: DetailRights;
}): JSX.Element {
	const o = at(locale);
	const a = d.appointment;
	const col = d.columns.find((c) => c.id === a.columnId);
	const extras = a.resourceIds
		.map((r) => d.columns.find((c) => c.id === r)?.name)
		.filter((x): x is string => x !== undefined);
	const open = a.status === "confirmed" || a.status === "requested";
	const name = a.title ?? d.client?.name ?? m.unnamed_group({}, o);
	const usage = d.pkg === null ? null : packageUsage(d.pkg, d.clientAppointments, todayIso());
	const l = d.pkg === null ? null : ledger(d.pkg.totalBani, paidBani(d.pkg));
	const item: ReminderItem | null =
		d.client === null || col === undefined || !open
			? null
			: { appointment: a, client: d.client, column: col, sent: false };
	const wa = item === null ? null : whatsappHref(item, d.app, locale);
	const mail = item === null ? null : emailHref(item, d.app, locale);
	return (
		<div id="detail-body" class="dt adm-stack" data-appt={a.id}>
			<div class="adm-row dt__who">
				<span class="cal__mono" aria-hidden="true">
					{initials(name)}
				</span>
				<div>
					<h3 class="adm-h2" style="margin:0">
						{name}
					</h3>
					{d.client?.phone ? (
						<a class="dt__phone" href={`tel:${d.client.phone.replace(/\s+/g, "")}`}>
							{d.client.phone}
						</a>
					) : null}
				</div>
				<StatusPill status={a.status} label={statusLabel(a.status, locale)} />
			</div>
			<dl class="dt__facts">
				<div>
					<dt>{m.ap_when({}, o)}</dt>
					<dd>
						{dayLong(locale, a.date)}, {hhmm(a.startMin)}–{hhmm(a.startMin + a.durationMin)}
					</dd>
				</div>
				<div>
					<dt>{m.field_service({}, o)}</dt>
					<dd>{d.service?.name ?? ""}</dd>
				</div>
				<div>
					<dt>{m.field_column({}, o)}</dt>
					<dd>{[col?.name, ...extras].filter((x) => x !== undefined).join(" · ")}</dd>
				</div>
				<div>
					<dt>{m.ap_money({}, o)}</dt>
					<dd>
						{d.pkg !== null && usage !== null && l !== null ? (
							<>
								{d.pkg.name} · {m.ap_left({ n: usage.left }, o)}
								{l.remainingBani > 0
									? ` · ${m.pkg_remaining({}, o)} ${formatAmount(l.remainingBani, locale)} ${CURRENCY}`
									: ""}
							</>
						) : a.paidMethod !== null ? (
							<>
								{formatAmount(a.priceBani, locale)} {CURRENCY} · {m.ap_paid({}, o)}
							</>
						) : (
							<>
								{formatAmount(a.priceBani, locale)} {CURRENCY} · {m.ap_unpaid({}, o)}
							</>
						)}
					</dd>
				</div>
				{a.note === "" ? null : (
					<div>
						<dt>{m.note_label({}, o)}</dt>
						<dd class="dt__note">{a.note}</dd>
					</div>
				)}
				{a.cancelReason === null ? null : (
					<div>
						<dt>{m.ap_cancel_reason({}, o)}</dt>
						<dd>{a.cancelReason}</dd>
					</div>
				)}
			</dl>

			<div class="dt__actions">
				{rights.edit ? (
					<button
						type="button"
						class="adm-btn adm-btn--primary"
						data-on:click={`@get('/calendar/editor?id=${a.id}')`}
					>
						<Icon name="edit" />
						{m.ap_edit({}, o)}
					</button>
				) : null}
				{open && rights.edit ? (
					<>
						<button type="button" class="adm-btn" data-on:click={act(a.id, "attended")}>
							<Icon name="check" />
							{m.ap_mark_attended({}, o)}
						</button>
						<button type="button" class="adm-btn" data-on:click={act(a.id, "no-show")}>
							<Icon name="alert" />
							{m.ap_mark_absent({}, o)}
						</button>
					</>
				) : null}
				{rights.pay &&
				a.status !== "cancelled" &&
				a.paidMethod === null &&
				d.pkg === null &&
				a.priceBani > 0 ? (
					<div class="dt__pay" data-signals={JSON.stringify({ dtPay: "cash" })}>
						<select class="adm-input" aria-label={m.pay_method({}, o)} data-bind="dtPay">
							<option value="cash">{m.method_cash({}, o)}</option>
							<option value="card">{m.method_card({}, o)}</option>
							<option value="transfer">{m.method_transfer({}, o)}</option>
						</select>
						<button type="button" class="adm-btn" data-on:click={act(a.id, "pay")}>
							{m.ap_collect({}, o)}
						</button>
					</div>
				) : null}
				{wa === null ? null : (
					<a class="adm-btn" href={wa} target="_blank" rel="noopener">
						<Icon name="chat" />
						WhatsApp
					</a>
				)}
				{mail === null ? null : (
					<a class="adm-btn" href={mail}>
						<Icon name="mail" />
						{m.email_label({}, o)}
					</a>
				)}
				{d.client === null ? null : (
					<a class="adm-btn adm-btn--ghost" href={`/clients/${d.client.id}`}>
						<Icon name="user" />
						{m.ap_open_client({}, o)}
					</a>
				)}
			</div>

			{a.status === "cancelled" || !rights.cancel ? null : (
				<div class="dt__cancel" data-signals={JSON.stringify({ dtAsk: false, dtReason: "" })}>
					<button
						type="button"
						class="adm-btn adm-btn--danger"
						data-show="!$dtAsk"
						data-on:click="$dtAsk = true"
					>
						<Icon name="x" />
						{m.ap_cancel({}, o)}
					</button>
					<form
						class="adm-stack"
						style="display:none"
						data-show="$dtAsk"
						data-on:submit__prevent={act(a.id, "cancel")}
					>
						<label class="adm-field">
							<span>{m.ap_cancel_reason({}, o)}</span>
							<input class="adm-input" type="text" maxlength={500} required data-bind="dtReason" />
						</label>
						<div class="adm-row">
							<button type="submit" class="adm-btn adm-btn--danger">
								{m.ap_cancel_go({}, o)}
							</button>
							<button type="button" class="adm-btn" data-on:click="$dtAsk = false">
								{m.cancel({}, o)}
							</button>
						</div>
					</form>
				</div>
			)}
		</div>
	);
}
