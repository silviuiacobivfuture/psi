import type { FormDefinition, FormField } from "@psi/scheduling/clinic";
import { recordResourceFor } from "@psi/scheduling/permissions";
import { EmptyState, Icon } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { RECORD_RESOURCES } from "../actions/keys";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Can } from "../lib/can";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import type { ClientRecord } from "../port/schema-clinical";
import { stampText } from "./client-notes";

/**
 * The reports that belong to no client (kept from the old app with their visit, their client deleted there). Only the
 * app-wide scope of a form's resource reaches them: an own or assigned scope has no client to stand on. The console
 * shows the group only to someone holding one such scope, and only the forms they hold it for; the service refuses
 * everyone else on its own.
 */
export function wholeAppRecordViews(can: Can): ReadonlySet<string> {
	return new Set<string>(RECORD_RESOURCES.filter((r) => can.scopes(`${r}_view`).includes("all")));
}

const titleOf = (defs: ReadonlyArray<FormDefinition>, key: string, locale: Locale): string =>
	defs.find((t) => t.key === key)?.title[locale] ?? key;

const shownTo = (allowed: ReadonlySet<string>, r: ClientRecord): boolean =>
	r.clientId === null && allowed.has(recordResourceFor(r.formKey));

/** A stored answer as text: the value itself (an option by its label), a list one per line, yes or no in words. */
function answerText(field: FormField | undefined, value: unknown, locale: Locale): string {
	const o = at(locale);
	if (typeof value === "boolean") return value ? m.cl_rec_yes({}, o) : m.cl_rec_no({}, o);
	if (typeof value === "string" || typeof value === "number") {
		const option = field?.options?.find((x) => x.value === value);
		return option === undefined ? String(value) : option.label[locale];
	}
	if (Array.isArray(value)) return value.map((v) => answerText(field, v, locale)).join("\n");
	if (typeof value === "object" && value !== null) return JSON.stringify(value);
	return "";
}

function Answer({
	field,
	value,
	locale,
}: {
	field: FormField;
	value: unknown;
	locale: Locale;
}): JSX.Element {
	const columns = field.columns ?? [];
	if (field.type === "table" && Array.isArray(value)) {
		return (
			<table class="adm-table" data-answer-table={field.key}>
				<thead>
					<tr>
						{columns.map((c) => (
							<th key={c.key}>{c.label[locale]}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{value.map((row, i) => (
						<tr key={String(i)}>
							{columns.map((c) => (
								<td key={c.key}>
									{typeof row === "object" && row !== null && !Array.isArray(row)
										? String(Object.getOwnPropertyDescriptor(row, c.key)?.value ?? "")
										: ""}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		);
	}
	return <p class="cl-answer">{answerText(field, value, locale)}</p>;
}

/** The page: one group, "Without a client", newest first; each row opens the report to read. */
export async function renderRecordsWithoutClient(
	ctx: Ctx,
	records: ReadonlyArray<ClientRecord>,
	templates: ReadonlyArray<FormDefinition>,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	return Page({
		ctx,
		current: "more",
		title: m.orphan_records_title({}, o),
		children: (
			<div class="adm-page">
				<h1 class="adm-h1">{m.orphan_records_title({}, o)}</h1>
				<p class="adm-muted">{m.orphan_records_lead({}, o)}</p>
				<section class="cl-group" data-group="without-client">
					<h2 class="adm-h2">
						{m.orphan_records_group({}, o)} ({records.length})
					</h2>
					{records.length === 0 ? (
						<EmptyState
							icon="file"
							title={m.orphan_records_empty({}, o)}
							text={m.orphan_records_empty_text({}, o)}
						/>
					) : (
						<ul class="cl-rows">
							{records.map((r) => (
								<li key={r.id} class="cl-row" data-record={r.id}>
									<a class="cl-row__main" href={`/records/${r.id}`}>
										<strong>{titleOf(templates, r.formKey, ctx.locale)}</strong>
										<span class="adm-muted">
											{r.authorName} · {stampText(ctx.locale, r.createdAt)}
										</span>
									</a>
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		),
	});
}

/** One report of no client, to read: every answered field of its form, nothing to edit. */
export async function renderRecordWithoutClient(
	ctx: Ctx,
	record: ClientRecord,
	def: FormDefinition | undefined,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const title = def?.title[ctx.locale] ?? record.formKey;
	const fields = (def?.fields ?? []).filter((f) => record.data[f.key] !== undefined);
	// Answers the form no longer names (or a form the console does not hold) are shown under their key: never hidden.
	const named = new Set(fields.map((f) => f.key));
	const others = Object.entries(record.data).filter(([key]) => !named.has(key));
	return Page({
		ctx,
		current: "more",
		title,
		children: (
			<div class="adm-page" data-record={record.id}>
				<a class="adm-btn adm-btn--ghost cl-back" href="/records">
					<Icon name="chevron-left" />
					{m.orphan_records_group({}, o)}
				</a>
				<h1 class="adm-h1">{title}</h1>
				<p class="adm-muted">
					{m.orphan_records_group({}, o)} · {record.authorName} ·{" "}
					{stampText(ctx.locale, record.createdAt)}
				</p>
				<dl class="cl-answers">
					{fields.map((f) => (
						<div key={f.key} class="adm-field" data-field={f.key}>
							<dt>{f.label[ctx.locale]}</dt>
							<dd>
								<Answer field={f} value={record.data[f.key]} locale={ctx.locale} />
							</dd>
						</div>
					))}
					{others.map(([key, value]) => (
						<div key={key} class="adm-field" data-field={key}>
							<dt>{key}</dt>
							<dd>
								<p class="cl-answer">{answerText(undefined, value, ctx.locale)}</p>
							</dd>
						</div>
					))}
				</dl>
			</div>
		),
	});
}

/** `/records` and `/records/:rid`: refused (403) to anyone without an app-wide record scope, 404 for a client's record. */
export function registerRecordsWithoutClient(app: Hono<Env>): void {
	app.get("/records", async (c) => {
		const ctx = c.var.ctx;
		const allowed = wholeAppRecordViews(ctx.can);
		if (allowed.size === 0) throw new PortError("forbidden", "records of no client");
		const [records, templates] = await Promise.all([
			ctx.port.recordsWithoutClient(ctx.app),
			ctx.port.formTemplates(ctx.app),
		]);
		return c.html(
			await renderRecordsWithoutClient(
				ctx,
				records.filter((r) => shownTo(allowed, r)),
				templates,
			),
			200,
			{ "cache-control": "private, no-store" },
		);
	});
	app.get("/records/:rid", async (c) => {
		const ctx = c.var.ctx;
		const allowed = wholeAppRecordViews(ctx.can);
		if (allowed.size === 0) throw new PortError("forbidden", "records of no client");
		const record = await ctx.port.record(ctx.app, c.req.param("rid"));
		// A client's record is opened from that client's page, never from here.
		if (record === null || record.clientId !== null) return c.notFound();
		if (!shownTo(allowed, record)) throw new PortError("forbidden", "records of no client");
		const templates = await ctx.port.formTemplates(ctx.app);
		return c.html(
			await renderRecordWithoutClient(
				ctx,
				record,
				templates.find((t) => t.key === record.formKey),
			),
			200,
			{ "cache-control": "private, no-store" },
		);
	});
}
