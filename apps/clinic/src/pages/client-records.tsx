import type { FormDefinition, FormField } from "@psi/scheduling/clinic";
import { Banner, EmptyState, Icon, OverflowMenu } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, EmptyActions, menuItems } from "../actions/render";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { dayLong, hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { cellName } from "../lib/record-form";
import { m } from "../paraglide/messages.js";
import type { Appointment, Client } from "../port/schema";
import type { ClientRecord } from "../port/schema-clinical";
import { stampText } from "./client-notes";
import { cutTab, TabPager, type TabPaging } from "./client-tab-pager";

const titleOf = (def: FormDefinition | undefined, key: string, locale: Locale): string =>
	def?.title[locale] ?? key;

/** One record: its form, who wrote it and when, draft or final, and what may be done to it. */
export function RecordRow({
	ctx,
	clientId,
	r,
	templates,
}: {
	ctx: Ctx;
	clientId: string;
	r: ClientRecord;
	templates: ReadonlyArray<FormDefinition>;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<li class="cl-row" data-record={r.id}>
			<a class="cl-row__main" href={`/clients/${clientId}/records/${r.id}`}>
				<strong>
					{titleOf(
						templates.find((t) => t.key === r.formKey),
						r.formKey,
						ctx.locale,
					)}
				</strong>
				<span class="adm-muted">
					{r.authorName} · {stampText(ctx.locale, r.updatedAt)}
				</span>
			</a>
			<span
				class={`adm-pill ${r.status === "final" ? "adm-pill--attended" : "adm-pill--requested"}`}
			>
				{r.status === "final" ? m.cl_rec_final({}, o) : m.cl_rec_draft({}, o)}
			</span>
			<OverflowMenu
				id={`rec-${r.id}`}
				label={m.client_more({}, o)}
				items={menuItems(ctx, "client.records", { clientId, id: r.id })}
			/>
		</li>
	);
}

/** The client's records: a row each, draft or final, who wrote it and when, a page at a time. */
export function RecordsTab({
	ctx,
	clientId,
	records,
	templates,
	paging,
}: {
	ctx: Ctx;
	clientId: string;
	records: ReadonlyArray<ClientRecord>;
	templates: ReadonlyArray<FormDefinition>;
	paging: TabPaging;
}): JSX.Element {
	const o = at(ctx.locale);
	const entity = { clientId };
	const page = cutTab(records, paging);
	return (
		<div class="cl-tab">
			<ActionBar ctx={ctx} screen="client.records" entity={entity} />
			{page.total === 0 ? (
				<EmptyState
					icon="file"
					title={m.records_empty_title({}, o)}
					text={m.records_empty_text({}, o)}
				>
					<EmptyActions ctx={ctx} screen="client.records" entity={entity} />
				</EmptyState>
			) : (
				<>
					<ul class="cl-rows" aria-label={m.tab_records({}, o)}>
						{page.items.map((r) => (
							<RecordRow key={r.id} ctx={ctx} clientId={clientId} r={r} templates={templates} />
						))}
					</ul>
					<TabPager ctx={ctx} clientId={clientId} tab="records" shown={page} size={paging.size} />
				</>
			)}
		</div>
	);
}

/** Step one of "Fișă nouă": the templates, each one tap. */
export async function renderTemplatePicker(
	ctx: Ctx,
	client: Client,
	templates: ReadonlyArray<FormDefinition>,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	return Page({
		ctx,
		current: "clients",
		title: m.ac_record_new({}, o),
		children: (
			<div class="adm-page">
				<a class="adm-btn adm-btn--ghost cl-back" href={`/clients/${client.id}/records`}>
					<Icon name="chevron-left" />
					{client.name}
				</a>
				<h1 class="adm-h1">{m.ac_record_new({}, o)}</h1>
				<p class="adm-muted">{m.cl_rec_pick({}, o)}</p>
				<ul class="cl-rows">
					{templates.map((t) => (
						<li key={t.key} class="cl-row">
							<a
								class="cl-row__main"
								data-template={t.key}
								href={`/clients/${client.id}/records/new?form=${t.key}`}
							>
								<strong>{t.title[ctx.locale]}</strong>
								<span class="adm-muted">
									{t.kind === "questionnaire"
										? m.cl_rec_questionnaire({}, o)
										: m.cl_rec_report({}, o)}
								</span>
							</a>
							<Icon name="chevron-right" />
						</li>
					))}
				</ul>
			</div>
		),
	});
}

type Values = Readonly<Record<string, unknown>>;

const asText = (v: unknown): string =>
	typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
const asList = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function TableField({
	field,
	value,
	locale,
}: {
	field: FormField;
	value: unknown;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	const rows = (Array.isArray(value) ? value : []).filter(
		(r): r is Record<string, unknown> => typeof r === "object" && r !== null,
	);
	const columns = field.columns ?? [];
	const row = (i: number | "__i__", data: Record<string, unknown>): JSX.Element => (
		<fieldset class="cl-tablerow" data-row>
			{columns.map((c) => {
				const name = cellName(field.key, i as number, c.key);
				if (c.type === "longtext")
					return (
						<label key={c.key} class="adm-field">
							<span>{c.label[locale]}</span>
							<textarea class="adm-input" name={name} rows={2}>
								{asText(data[c.key])}
							</textarea>
						</label>
					);
				return (
					<label key={c.key} class="adm-field">
						<span>{c.label[locale]}</span>
						<input
							class="adm-input"
							name={name}
							type="text"
							inputmode={c.type === "number" ? "decimal" : "text"}
							value={asText(data[c.key])}
						/>
					</label>
				);
			})}
			<button type="button" class="adm-btn adm-btn--ghost" data-remove-row>
				{m.cl_rec_row_remove({}, o)}
			</button>
		</fieldset>
	);
	return (
		<div class="cl-table" data-table={field.key} data-next={Math.max(rows.length, 1)}>
			{(rows.length === 0 ? [{}] : rows).map((r, i) => (
				<div key={i}>{row(i, r)}</div>
			))}
			<template data-row-template>{row("__i__", {})}</template>
			<button type="button" class="adm-btn" data-add-row>
				<Icon name="plus" />
				{m.cl_rec_row_add({}, o)}
			</button>
		</div>
	);
}

function FieldInput({
	field,
	value,
	locale,
}: {
	field: FormField;
	value: unknown;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	const name = `f.${field.key}`;
	const options = field.options;
	switch (field.type) {
		case "text":
		case "file":
			return <input class="adm-input" name={name} maxlength={4000} value={asText(value)} />;
		case "longtext":
			return (
				<textarea class="adm-input" name={name} rows={4}>
					{asText(value)}
				</textarea>
			);
		case "number":
		case "money":
			return (
				<input
					class="adm-input"
					name={name}
					type="text"
					inputmode="decimal"
					value={asText(value)}
				/>
			);
		case "rating":
			return (
				<select class="adm-input" name={name}>
					<option value="">{m.cl_rec_none({}, o)}</option>
					{Array.from(
						{ length: (field.max ?? 10) - (field.min ?? 0) + 1 },
						(_v, i) => (field.min ?? 0) + i,
					).map((n) => (
						<option key={n} value={String(n)} selected={asText(value) === String(n)}>
							{n}
						</option>
					))}
				</select>
			);
		case "date":
			return <input class="adm-input" name={name} type="date" value={asText(value)} />;
		case "yesno":
			return (
				<select class="adm-input" name={name}>
					<option value="">{m.cl_rec_none({}, o)}</option>
					<option value="yes" selected={value === true}>
						{m.cl_rec_yes({}, o)}
					</option>
					<option value="no" selected={value === false}>
						{m.cl_rec_no({}, o)}
					</option>
				</select>
			);
		case "choice":
			return options.length === 0 ? (
				<input class="adm-input" name={name} maxlength={4000} value={asText(value)} />
			) : (
				<select class="adm-input" name={name}>
					<option value="">{m.cl_rec_none({}, o)}</option>
					{options.map((opt) => (
						<option key={opt.value} value={opt.value} selected={asText(value) === opt.value}>
							{opt.label[locale]}
						</option>
					))}
				</select>
			);
		case "multichoice": {
			const picked = asList(value);
			return options.length === 0 ? (
				<>
					<textarea class="adm-input" name={name} rows={2}>
						{picked.join("\n")}
					</textarea>
					<span class="adm-muted">{m.cl_rec_one_per_line({}, o)}</span>
				</>
			) : (
				<fieldset class="cl-choices">
					{options.map((opt) => (
						<label key={opt.value} class="adm-check">
							<input
								type="checkbox"
								name={name}
								value={opt.value}
								checked={picked.includes(opt.value)}
							/>
							{opt.label[locale]}
						</label>
					))}
				</fieldset>
			);
		}
		case "table":
			return <TableField field={field} value={value} locale={locale} />;
		default: {
			const never: never = field.type;
			return never;
		}
	}
}

/** Adds, removes and numbers the rows of a table field: no frameworks, the form works without it for existing rows. */
const TABLE_JS = `(() => {
  const renumber = (host) => host.querySelectorAll('[data-row]').forEach((row, i) => row.querySelectorAll('[name]').forEach((el) => { el.name = el.name.replace(/\\.(\\d+|__i__)\\./, '.' + i + '.'); }));
  document.querySelectorAll('[data-table]').forEach((host) => {
    host.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      if (t.closest('[data-add-row]')) {
        const tpl = host.querySelector('[data-row-template]');
        if (!tpl) return;
        const wrap = document.createElement('div');
        wrap.append(tpl.content.cloneNode(true));
        host.insertBefore(wrap, tpl);
        renumber(host);
        wrap.querySelector('input,textarea')?.focus();
      }
      const rm = t.closest('[data-remove-row]');
      if (rm) {
        const rows = host.querySelectorAll('[data-row]');
        const row = rm.closest('[data-row]');
        if (rows.length > 1) row?.parentElement?.remove(); else row?.querySelectorAll('input,textarea').forEach((el) => { el.value = ''; });
        renumber(host);
      }
    });
  });
})();`;

/** The form filler: every field of the template by its type, the table type as stacked rows, draft or final. */
export async function renderRecordFiller(
	ctx: Ctx,
	client: Client,
	def: FormDefinition,
	options: {
		record: ClientRecord | null;
		values: Values;
		appointments: ReadonlyArray<Appointment>;
		appointmentId: string | null;
		invalid: boolean;
	},
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const { record } = options;
	return Page({
		ctx,
		current: "clients",
		title: def.title[ctx.locale],
		noFab: true,
		children: (
			<div class="adm-page">
				<a class="adm-btn adm-btn--ghost cl-back" href={`/clients/${client.id}/records`}>
					<Icon name="chevron-left" />
					{client.name}
				</a>
				<h1 class="adm-h1">{def.title[ctx.locale]}</h1>
				{options.invalid ? (
					<Banner tone="error" icon="alert">
						{m.cl_rec_invalid({}, o)}
					</Banner>
				) : null}
				<form
					method="post"
					action={`/clients/${client.id}/records`}
					class="cl-form cl-filler"
					data-form="record"
					data-action="record.save"
				>
					<input type="hidden" name="clientId" value={client.id} />
					<input type="hidden" name="formKey" value={def.key} />
					{record === null ? null : <input type="hidden" name="id" value={record.id} />}
					{options.appointments.length === 0 ? null : (
						<label class="adm-field">
							<span>{m.cl_rec_appointment({}, o)}</span>
							<select class="adm-input" name="appointmentId">
								<option value="">{m.cl_rec_none({}, o)}</option>
								{options.appointments.map((a) => (
									<option key={a.id} value={a.id} selected={options.appointmentId === a.id}>
										{dayLong(ctx.locale, a.date)} {hhmm(a.startMin)}
									</option>
								))}
							</select>
						</label>
					)}
					{def.fields.map((f) => (
						<div key={f.key} class="adm-field cl-field" data-field={f.key} data-type={f.type}>
							<span>
								{f.label[ctx.locale]}
								{f.required ? " *" : ""}
							</span>
							<FieldInput field={f} value={options.values[f.key]} locale={ctx.locale} />
						</div>
					))}
					<div class="cl-buttons cl-buttons--sticky">
						<button class="adm-btn" type="submit" name="status" value="draft">
							{m.cl_rec_save_draft({}, o)}
						</button>
						<button class="adm-btn adm-btn--primary" type="submit" name="status" value="final">
							{m.cl_rec_finalise({}, o)}
						</button>
					</div>
				</form>
				<script dangerouslySetInnerHTML={{ __html: TABLE_JS }} />
			</div>
		),
	});
}
