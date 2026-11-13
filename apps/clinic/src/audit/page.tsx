import { Banner, EmptyState, Icon, PageHeader, Sheet, Toolbar } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { short } from "../lib/when";
import { m } from "../paraglide/messages.js";
import type { AuditEvent } from "../port/schema";
import { DrawerShell } from "./drawer";
import { actionChoices, OBJECT_TYPES, typeLabel } from "./labels";
import { type AuditLookup, loadLookup } from "./lookup";
import { type AuditQuery, byFilters, bySearch, type Paged, paged, searchOf } from "./query";
import { describe, type Row } from "./rows";

export const DRAWER_SIGNAL = "auditOpen";

/** The events this query shows, said in words: the filters first, then the search (which needs the words). */
export async function select(
	ctx: Ctx,
	events: ReadonlyArray<AuditEvent>,
	q: AuditQuery,
): Promise<{ rows: Paged<Row>; all: ReadonlyArray<Row>; lookup: AuditLookup }> {
	const structured = byFilters(events, q);
	const searching = q.q !== undefined && q.q !== "";
	// Without a search only the page's own events are named (each appointment is a call); with one, every candidate is.
	const firstPage = structured.slice(0, 1000);
	const lookup = await loadLookup(
		ctx,
		searching ? firstPage : firstPage.slice(0, (q.page ?? 1) * 50),
	);
	const words = (list: ReadonlyArray<AuditEvent>): Row[] =>
		list.map((e) => describe(e, lookup, ctx.locale, ctx.can));
	const all = bySearch(words(structured), q);
	return { rows: paged(all, q.page ?? 1), all, lookup };
}

const rowHandler = (id: string): string =>
	`if (!evt.target.closest('a')) { $${DRAWER_SIGNAL} = true; @get('/audit/${encodeURIComponent(id).replaceAll("'", "%27")}'); setTimeout(() => document.querySelector('#adm-sheet-auditOpen-title + .adm-iconbtn')?.focus(), 60) }`;

function Filters({
	ctx,
	q,
	people,
}: {
	ctx: Ctx;
	q: AuditQuery;
	people: ReadonlyArray<{ value: string; label: string }>;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<form method="get" action="/audit" class="audit-filters" aria-label={m.jr_search_label({}, o)}>
			<label class="adm-field audit-filters__q">
				<span>{m.jr_search_label({}, o)}</span>
				<input
					class="adm-input"
					type="search"
					name="q"
					value={q.q ?? ""}
					placeholder={m.jr_search_ph({}, o)}
					autocomplete="off"
				/>
			</label>
			<label class="adm-field">
				<span>{m.jr_f_person({}, o)}</span>
				<select class="adm-input" name="person">
					<option value="">{m.jr_f_all_people({}, o)}</option>
					{people.map((p) => (
						<option key={p.value} value={p.value} selected={q.person === p.value}>
							{p.label}
						</option>
					))}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.jr_f_action({}, o)}</span>
				<select class="adm-input" name="action">
					<option value="">{m.jr_f_all({}, o)}</option>
					{actionChoices(ctx.locale).map((a) => (
						<option key={a.key} value={a.key} selected={q.action === a.key}>
							{a.label}
						</option>
					))}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.jr_f_type({}, o)}</span>
				<select class="adm-input" name="type">
					<option value="">{m.jr_f_all({}, o)}</option>
					{OBJECT_TYPES.map((t) => (
						<option key={t} value={t} selected={q.type === t}>
							{typeLabel(t, ctx.locale)}
						</option>
					))}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.jr_f_from({}, o)}</span>
				<input class="adm-input" type="date" name="from" value={q.from ?? ""} />
			</label>
			<label class="adm-field">
				<span>{m.jr_f_to({}, o)}</span>
				<input class="adm-input" type="date" name="to" value={q.to ?? ""} />
			</label>
			<div class="audit-filters__go">
				<button class="adm-btn adm-btn--primary" type="submit">
					{m.jr_apply({}, o)}
				</button>
				<a class="adm-btn" href="/audit">
					{m.jr_reset({}, o)}
				</a>
			</div>
		</form>
	);
}

function Pager({ ctx, q, p }: { ctx: Ctx; q: AuditQuery; p: Paged<Row> }): JSX.Element | null {
	if (p.pages <= 1) return null;
	const o = at(ctx.locale);
	return (
		<nav class="audit-pager" aria-label={m.jr_page({ p: p.page, t: p.pages }, o)}>
			{p.page > 1 ? (
				<a class="adm-btn" href={`/audit${searchOf(q, { page: p.page - 1 })}`} rel="prev">
					{m.jr_prev({}, o)}
				</a>
			) : null}
			<span class="adm-muted">{m.jr_page({ p: p.page, t: p.pages }, o)}</span>
			{p.page < p.pages ? (
				<a class="adm-btn" href={`/audit${searchOf(q, { page: p.page + 1 })}`} rel="next">
					{m.jr_next({}, o)}
				</a>
			) : null}
		</nav>
	);
}

function Table({ ctx, rows }: { ctx: Ctx; rows: ReadonlyArray<Row> }): JSX.Element {
	const o = at(ctx.locale);
	const tz = ctx.caps.timeZone;
	return (
		<section class="adm-scroll" aria-label={m.audit_title({}, o)}>
			<table class="adm-table audit-table">
				<thead>
					<tr>
						<th scope="col">{m.audit_when({}, o)}</th>
						<th scope="col">{m.audit_who({}, o)}</th>
						<th scope="col">{m.audit_what({}, o)}</th>
						<th scope="col">{m.audit_target({}, o)}</th>
						<th scope="col">{m.jr_col_source({}, o)}</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => {
						const when = short(r.event.at, ctx.locale, tz);
						return (
							<tr
								key={r.event.id}
								data-audit-row={r.event.id}
								data-on:click={rowHandler(r.event.id)}
							>
								<td data-c="when">
									<button
										type="button"
										class="audit-open"
										aria-label={m.jr_open_row({ when }, o)}
										aria-haspopup="dialog"
									>
										{when}
									</button>
								</td>
								<td data-c="who">{r.who}</td>
								<td data-c="what">
									<span class="audit-what">{r.sentence}</span>
								</td>
								<td data-c="object">
									{r.href === null ? (
										`${r.typeText} · ${r.objectText}`
									) : (
										<a class="audit-link" href={r.href}>
											{`${r.typeText} · ${r.objectText}`}
										</a>
									)}
								</td>
								<td data-c="source">{r.source}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</section>
	);
}

export interface AuditView {
	events: ReadonlyArray<AuditEvent> | null;
	query: AuditQuery;
	shown: Paged<Row> | null;
	people: ReadonlyArray<{ value: string; label: string }>;
}

/** The journal: filters, the table of events said in words, a pager, and the drawer a row opens. */
export async function renderAuditPage(ctx: Ctx, view: AuditView): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const { shown, query: q } = view;
	return Page({
		ctx,
		current: "audit",
		title: m.audit_title({}, o),
		overlays: (
			<Sheet signal={DRAWER_SIGNAL} title={m.jr_d_title({}, o)} closeLabel={m.jr_d_close({}, o)}>
				<DrawerShell ctx={ctx} />
			</Sheet>
		),
		children: (
			<div
				class="adm-page"
				data-signals={`{${DRAWER_SIGNAL}:false}`}
				{...{ "data-on:keydown__window": `evt.key === 'Escape' && ($${DRAWER_SIGNAL} = false)` }}
			>
				<PageHeader title={m.nav_audit({}, o)}>
					{shown === null || shown.total === 0 ? null : (
						<a class="adm-btn" href={`/audit/export.csv${searchOf({ ...q, page: 1 })}`} download>
							<Icon name="list" />
							{m.jr_export({}, o)}
						</a>
					)}
				</PageHeader>
				<Toolbar>
					<Filters ctx={ctx} q={q} people={view.people} />
				</Toolbar>
				{shown === null ? (
					<Banner tone="error" icon="alert">
						<strong>{m.error_title({}, o)}</strong>
						<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
						<a class="adm-btn" href={`/audit${searchOf(q)}`}>
							{m.retry({}, o)}
						</a>
					</Banner>
				) : view.events?.length === 0 ? (
					<EmptyState
						icon="list"
						title={m.audit_empty_title({}, o)}
						text={m.audit_empty_text({}, o)}
					/>
				) : shown.total === 0 ? (
					<EmptyState icon="search" title={m.jr_none({}, o)} />
				) : (
					<>
						<p class="adm-muted" role="status">
							{m.jr_count({ n: shown.total }, o)}
						</p>
						<Table ctx={ctx} rows={shown.items} />
						<Pager ctx={ctx} q={q} p={shown} />
					</>
				)}
			</div>
		),
	});
}
