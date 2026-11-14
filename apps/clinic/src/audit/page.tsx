import { Banner, EmptyState, Icon, Sheet, Toolbar } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { moreHref, ShowMore } from "../lib/show-more";
import { short } from "../lib/when";
import { OrgFrame } from "../pages/org-settings";
import { m } from "../paraglide/messages.js";
import { DrawerShell } from "./drawer";
import type { JournalPage, JournalRow } from "./journal";
import { actionChoices, OBJECT_TYPES, typeLabel } from "./labels";
import { type AuditQuery, paramsOf, searchOf } from "./query";

export const DRAWER_SIGNAL = "auditOpen";

/** The drawer's address: the event, the log's page it was read from and the days of that read (any row opens). */
function drawerPath(r: JournalRow): string {
	const q = new URLSearchParams({
		...(r.cursor === null ? {} : { c: r.cursor }),
		...(r.window.from === undefined ? {} : { from: r.window.from }),
		...(r.window.to === undefined ? {} : { to: r.window.to }),
	}).toString();
	return `/settings/audit/${encodeURIComponent(r.row.event.id)}${q === "" ? "" : `?${q}`}`.replaceAll(
		"'",
		"%27",
	);
}

const rowHandler = (r: JournalRow): string =>
	`if (!evt.target.closest('a')) { $${DRAWER_SIGNAL} = true; @get('${drawerPath(r)}'); setTimeout(() => document.querySelector('#adm-sheet-auditOpen-title + .adm-iconbtn')?.focus(), 60) }`;

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
		<form
			method="get"
			action="/settings/audit"
			class="audit-filters"
			aria-label={m.jr_search_label({}, o)}
		>
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
				<a class="adm-btn" href="/settings/audit">
					{m.jr_reset({}, o)}
				</a>
			</div>
		</form>
	);
}

/** One event as a table row; a click (outside its link) opens the drawer. */
export function AuditRow({ ctx, r }: { ctx: Ctx; r: JournalRow }): JSX.Element {
	const o = at(ctx.locale);
	const { row } = r;
	const when = short(row.event.at, ctx.locale, ctx.caps.timeZone);
	return (
		<tr data-audit-row={row.event.id} data-on:click={rowHandler(r)}>
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
			<td data-c="who">{row.who}</td>
			<td data-c="what">
				<span class="audit-what">{row.sentence}</span>
			</td>
			<td data-c="object">
				{row.href === null ? (
					`${row.typeText} · ${row.objectText}`
				) : (
					<a class="audit-link" href={row.href}>
						{`${row.typeText} · ${row.objectText}`}
					</a>
				)}
			</td>
			<td data-c="source">{row.source}</td>
		</tr>
	);
}

/** How many events are shown, and whether older ones follow. */
export function AuditCount({
	ctx,
	shown,
	more,
}: {
	ctx: Ctx;
	shown: number;
	more: boolean;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<p class="adm-muted" role="status" id="audit-count">
			{more ? m.ls_shown({ n: String(shown) }, o) : m.jr_count({ n: shown }, o)}
		</p>
	);
}

/** The next page of the journal, with the same filters, appended to the table; nothing once the log is all shown. */
export function AuditMore({
	ctx,
	q,
	cursor,
	shown,
}: {
	ctx: Ctx;
	q: AuditQuery;
	cursor: string | null;
	shown: number;
}): JSX.Element {
	return (
		<ShowMore
			id="audit-more"
			href={moreHref("/settings/audit/more", cursor, shown, paramsOf(q))}
			label={m.ls_more({}, at(ctx.locale))}
		/>
	);
}

function Table({ ctx, rows }: { ctx: Ctx; rows: ReadonlyArray<JournalRow> }): JSX.Element {
	const o = at(ctx.locale);
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
				<tbody id="audit-rows">
					{rows.map((r) => (
						<AuditRow key={r.row.event.id} ctx={ctx} r={r} />
					))}
				</tbody>
			</table>
		</section>
	);
}

export interface AuditView {
	query: AuditQuery;
	/** The first page; null when the journal could not be read. */
	page: JournalPage | null;
	people: ReadonlyArray<{ value: string; label: string }>;
}

const filtered = (q: AuditQuery): boolean => Object.keys(paramsOf(q)).length > 0;

function Body({ ctx, view }: { ctx: Ctx; view: AuditView }): JSX.Element {
	const o = at(ctx.locale);
	const { page, query: q } = view;
	if (page === null)
		return (
			<Banner tone="error" icon="alert">
				<strong>{m.error_title({}, o)}</strong>
				<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
				<a class="adm-btn" href={`/settings/audit${searchOf(q)}`}>
					{m.retry({}, o)}
				</a>
			</Banner>
		);
	if (page.rows.length === 0 && page.nextCursor === null)
		return filtered(q) ? (
			<EmptyState icon="search" title={m.jr_none({}, o)} />
		) : (
			<EmptyState icon="list" title={m.audit_empty_title({}, o)} text={m.audit_empty_text({}, o)} />
		);
	return (
		<>
			{page.rows.length === 0 ? (
				// Nothing among the newest matches, but older events remain: the search goes on with "show more".
				<p class="adm-muted" role="status" id="audit-count">
					{m.jr_none_yet({}, o)}
				</p>
			) : (
				<AuditCount ctx={ctx} shown={page.rows.length} more={page.nextCursor !== null} />
			)}
			<Table ctx={ctx} rows={page.rows} />
			<AuditMore ctx={ctx} q={q} cursor={page.nextCursor} shown={page.rows.length} />
		</>
	);
}

/** The journal: filters, the table of events said in words a page at a time, and the drawer a row opens. */
export async function renderAuditPage(ctx: Ctx, view: AuditView): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const { page, query: q } = view;
	return OrgFrame({
		ctx,
		area: "audit",
		title: m.nav_audit({}, o),
		overlays: (
			<Sheet signal={DRAWER_SIGNAL} title={m.jr_d_title({}, o)} closeLabel={m.jr_d_close({}, o)}>
				<DrawerShell ctx={ctx} />
			</Sheet>
		),
		children: (
			<div
				class="adm-stack"
				style="gap:var(--adm-section-gap)"
				data-signals={`{${DRAWER_SIGNAL}:false}`}
				{...{ "data-on:keydown__window": `evt.key === 'Escape' && ($${DRAWER_SIGNAL} = false)` }}
			>
				{page === null || page.rows.length === 0 ? null : (
					<div class="adm-row">
						<a class="adm-btn" href={`/settings/audit/export.csv${searchOf(q)}`} download>
							<Icon name="list" />
							{m.jr_export({}, o)}
						</a>
					</div>
				)}
				<Toolbar>
					<Filters ctx={ctx} q={q} people={view.people} />
				</Toolbar>
				<Body ctx={ctx} view={view} />
			</div>
		),
	});
}
