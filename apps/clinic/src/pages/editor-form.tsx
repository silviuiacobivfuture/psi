import { Icon } from "@psi/ui/admin";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { moneyInput } from "../domain/money";
import { hhmm } from "../lib/dates";
import { type Editor, minutesOf } from "../lib/editor-signals";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Appointment, Client, Column, Service } from "../port/schema";
import { initials } from "./appt-tile";

export const DURATIONS = [20, 40, 60, 80, 120] as const;

export function blankEditor(p: {
	date: string;
	startMin: number;
	col: string;
	service: Service | undefined;
}): Editor {
	return {
		id: "",
		date: p.date,
		time: hhmm(p.startMin),
		col: p.col,
		room: "",
		device: "",
		client: "",
		clientName: "",
		q: "",
		svc: p.service?.id ?? "",
		dur: p.service?.durationMin ?? 50,
		status: "confirmed",
		note: "",
		remind: true,
		rec: "none",
		recN: 4,
		recUntil: "",
		pkg: "",
		price: moneyInput(p.service?.priceBani ?? 0, "ro"),
		payNow: false,
		payMethod: "cash",
		newc: false,
		nName: "",
		nPhone: "",
		nGuardian: "",
		override: "",
	};
}

export function editorOf(
	a: Appointment,
	client: Client | undefined,
	columns: ReadonlyArray<Column>,
	locale: Locale,
): Editor {
	const kind = (id: string) => columns.find((c) => c.id === id)?.kind;
	return {
		...blankEditor({ date: a.date, startMin: a.startMin, col: a.columnId, service: undefined }),
		id: a.id,
		client: a.clientId ?? "",
		clientName: client?.name ?? a.title ?? "",
		svc: a.serviceId,
		dur: a.durationMin,
		status: a.status === "requested" ? "requested" : "confirmed",
		note: a.note,
		remind: a.remind,
		room: a.resourceIds.find((r) => kind(r) === "room") ?? "",
		device: a.resourceIds.find((r) => kind(r) === "device") ?? "",
		pkg: a.packageId ?? "",
		price: moneyInput(a.priceBani, locale),
	};
}

const CHECK = "@post('/calendar/editor/check')";
const bind = (k: string): Record<string, string> => ({ [`data-bind:ed.${k}`]: "" });
const on = (event: string, expr: string): Record<string, string> => ({
	[`data-on:${event}`]: expr,
});

function Select({
	label,
	field,
	children,
	attrs,
}: {
	label: string;
	field: string;
	children: Child;
	attrs?: Record<string, string>;
}): JSX.Element {
	return (
		<label class="adm-field">
			<span>{label}</span>
			<select class="adm-input" {...bind(field)} {...attrs}>
				{children}
			</select>
		</label>
	);
}

export interface EditorFormProps {
	editor: Editor;
	columns: ReadonlyArray<Column>;
	services: ReadonlyArray<Service>;
	locale: Locale;
	/** Server-rendered fragments for the live parts. */
	clients: JSX.Element;
	conflicts: JSX.Element;
	packages: JSX.Element;
}

/** The appointment editor: one form, one save. Its live parts (matches, conflicts, packages) are patched in as you type. */
export function EditorForm(p: EditorFormProps): JSX.Element {
	const o = at(p.locale);
	const e = p.editor;
	const editing = e.id !== "";
	const rooms = p.columns.filter((c) => c.kind === "room");
	const devices = p.columns.filter((c) => c.kind === "device");
	return (
		<form
			id="editor-body"
			class="ed adm-stack"
			data-on:submit__prevent="@post('/calendar/editor/save')"
			{...on("change__debounce.150ms", CHECK)}
			novalidate
		>
			<h3 class="adm-h2">{editing ? m.ap_edit_title({}, o) : m.new_title({}, o)}</h3>

			<section class="ed-section" aria-labelledby="ed-client-h">
				<h4 class="ed-h" id="ed-client-h">
					{m.field_client({}, o)}
				</h4>
				<div class="ed-chosen" data-show="$ed.client !== ''">
					<span
						class="cal__mono"
						aria-hidden="true"
						data-text="$ed.clientName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()"
					>
						{initials(e.clientName)}
					</span>
					<strong data-text="$ed.clientName" />
					<button
						type="button"
						class="adm-btn adm-btn--ghost"
						data-on:click="$ed.client = ''; $ed.clientName = ''; $ed.pkg = ''"
					>
						{m.ap_change_client({}, o)}
					</button>
				</div>
				<div data-show="$ed.client === ''" class="adm-stack">
					<div data-show="!$ed.newc" class="adm-stack">
						<label class="adm-field">
							<span>{m.ap_search_client({}, o)}</span>
							<input
								class="adm-input"
								type="search"
								autocomplete="off"
								{...bind("q")}
								{...on("input__debounce.200ms", "@post('/calendar/editor/clients')")}
							/>
						</label>
						{p.clients}
						<button type="button" class="adm-btn" data-on:click="$ed.newc = true">
							<Icon name="plus" />
							{m.ap_new_client({}, o)}
						</button>
					</div>
					<div data-show="$ed.newc" class="ed-newc" style="display:none">
						<label class="adm-field">
							<span>{m.ap_c_name({}, o)}</span>
							<input class="adm-input" type="text" autocomplete="off" {...bind("nName")} />
						</label>
						<label class="adm-field">
							<span>{m.phone_label({}, o)}</span>
							<input class="adm-input" type="tel" autocomplete="off" {...bind("nPhone")} />
						</label>
						<label class="adm-field">
							<span>{m.guardian_label({}, o)}</span>
							<input class="adm-input" type="text" autocomplete="off" {...bind("nGuardian")} />
						</label>
						<button type="button" class="adm-btn adm-btn--ghost" data-on:click="$ed.newc = false">
							{m.ap_back_to_search({}, o)}
						</button>
					</div>
				</div>
			</section>

			<section class="ed-section" aria-labelledby="ed-when-h">
				<h4 class="ed-h" id="ed-when-h">
					{m.ap_when({}, o)}
				</h4>
				<Select
					label={m.field_service({}, o)}
					field="svc"
					attrs={{
						"data-on:change":
							"$ed.dur = Number(el.selectedOptions[0].dataset.dur); $ed.price = el.selectedOptions[0].dataset.price",
					}}
				>
					{p.services.map((s) => (
						<option
							key={s.id}
							value={s.id}
							data-dur={String(s.durationMin)}
							data-price={moneyInput(s.priceBani, p.locale)}
						>
							{s.name} · {s.durationMin} min
						</option>
					))}
				</Select>
				<div class="adm-row ed-grid2">
					<label class="adm-field">
						<span>{m.field_date({}, o)}</span>
						<input class="adm-input" type="date" {...bind("date")} />
					</label>
					<label class="adm-field">
						<span>{m.field_time({}, o)}</span>
						<input class="adm-input" type="time" step="300" {...bind("time")} />
					</label>
				</div>
				<fieldset class="adm-field ed-fieldset">
					<legend>{m.ap_duration({}, o)}</legend>
					<div class="ed-chips">
						{DURATIONS.map((d) => (
							<button
								key={d}
								type="button"
								class="ed-chip"
								data-attr:aria-pressed={`$ed.dur === ${d} ? 'true' : 'false'`}
								data-on:click={`$ed.dur = ${d}; ${CHECK}`}
							>
								{d}
							</button>
						))}
						<input
							class="adm-input ed-chip__custom"
							type="number"
							min="5"
							max="600"
							inputmode="numeric"
							aria-label={m.ap_duration_custom({}, o)}
							{...bind("dur")}
						/>
						<span class="adm-muted">min</span>
					</div>
				</fieldset>
				<Select label={m.field_column({}, o)} field="col">
					{p.columns.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</Select>
				<div class="adm-row ed-grid2">
					{rooms.length === 0 ? null : (
						<Select label={m.column_room({}, o)} field="room">
							<option value="">{m.ap_none({}, o)}</option>
							{rooms.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</Select>
					)}
					{devices.length === 0 ? null : (
						<Select label={m.column_device({}, o)} field="device">
							<option value="">{m.ap_none({}, o)}</option>
							{devices.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</Select>
					)}
				</div>
				{p.conflicts}
			</section>

			{p.packages}

			<section class="ed-section" data-show="$ed.pkg === ''" aria-labelledby="ed-pay-h">
				<h4 class="ed-h" id="ed-pay-h">
					{m.ap_price_pay({}, o)}
				</h4>
				<div class="adm-row ed-grid2">
					<label class="adm-field">
						<span>{m.ap_price({}, o)}</span>
						<input
							class="adm-input pk__amount"
							type="text"
							inputmode="decimal"
							autocomplete="off"
							{...bind("price")}
						/>
					</label>
					<label class="ed-check">
						<input type="checkbox" {...bind("payNow")} />
						<span>{m.ap_pay_now({}, o)}</span>
					</label>
				</div>
				<div data-show="$ed.payNow" style="display:none">
					<Select label={m.pay_method({}, o)} field="payMethod">
						<option value="cash">{m.method_cash({}, o)}</option>
						<option value="card">{m.method_card({}, o)}</option>
						<option value="transfer">{m.method_transfer({}, o)}</option>
					</Select>
				</div>
			</section>

			<section class="ed-section" aria-labelledby="ed-more-h">
				<h4 class="ed-h" id="ed-more-h">
					{m.ap_details({}, o)}
				</h4>
				<Select label={m.ap_status({}, o)} field="status">
					<option value="confirmed">{m.status_confirmed({}, o)}</option>
					<option value="requested">{m.status_requested({}, o)}</option>
				</Select>
				<label class="adm-field">
					<span>{m.note_label({}, o)}</span>
					<textarea class="adm-input" rows={2} maxlength={1000} {...bind("note")} />
				</label>
				<label class="ed-check">
					<input type="checkbox" {...bind("remind")} />
					<span>{m.ap_remind({}, o)}</span>
				</label>
				{editing ? null : (
					<div class="adm-stack">
						<Select label={m.ap_repeat({}, o)} field="rec">
							<option value="none">{m.ap_rec_none({}, o)}</option>
							<option value="count">{m.ap_rec_count({}, o)}</option>
							<option value="until">{m.ap_rec_until({}, o)}</option>
						</Select>
						<label class="adm-field" data-show="$ed.rec === 'count'" style="display:none">
							<span>{m.ap_rec_times({}, o)}</span>
							<input
								class="adm-input"
								type="number"
								min="2"
								max="52"
								inputmode="numeric"
								{...bind("recN")}
							/>
						</label>
						<label class="adm-field" data-show="$ed.rec === 'until'" style="display:none">
							<span>{m.ap_rec_last({}, o)}</span>
							<input class="adm-input" type="date" {...bind("recUntil")} />
						</label>
					</div>
				)}
			</section>

			<div class="adm-row ed-actions">
				<button class="adm-btn adm-btn--primary" type="submit">
					{editing ? m.save({}, o) : m.ap_create({}, o)}
				</button>
				<button class="adm-btn" type="button" data-on:click="$editor = false">
					{m.cancel({}, o)}
				</button>
			</div>
		</form>
	);
}

export { minutesOf };
