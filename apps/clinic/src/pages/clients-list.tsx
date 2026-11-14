import { Banner, EmptyState, PageHeader, Sheet, StatCard } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, EmptyActions } from "../actions/render";
import { Page } from "../chrome";
import { formatMoney } from "../domain/money";
import type { Ctx } from "../lib/context";
import { dayLong, hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { ListPager } from "../lib/paging";
import { m } from "../paraglide/messages.js";
import type { ClientListAsk, ClientPage } from "../port/port";
import type { Client, Column } from "../port/schema";
import type { ClientSummary } from "../port/schema-clinical";
import { BlacklistBadge } from "./client-flags";
import { SheetButtons } from "./client-sheets";
import { ClientFilters } from "./clients-filters";
import { addressParams, clientsHref, narrowed } from "./clients-query";

/** The region a page change replaces (and focuses): the count, the rows and the pager. */
export const RESULTS_ID = "client-results";

/** One client as a row: monogram, name, who to call, next or last visit, balance, and the flags. */
export function ClientRow({
	client,
	summary,
	ctx,
}: {
	client: Client;
	summary: ClientSummary | undefined;
	ctx: Ctx;
}): JSX.Element {
	const o = at(ctx.locale);
	const locale: Locale = ctx.locale;
	const listed = ctx.can.has("blacklist_view") ? (summary?.blacklist ?? null) : null;
	const owes = ctx.can.group("money") ? (summary?.owedBani ?? 0) : 0;
	const next = summary?.next ?? null;
	const last = summary?.lastVisit ?? null;
	return (
		<a class="client-row" href={`/clients/${client.id}`} data-client={client.id}>
			<span class="adm-avatar client-row__avatar" aria-hidden="true">
				{Array.from(client.name)[0]}
			</span>
			<span class="client-row__main">
				<strong>{client.name}</strong>
				<span class="adm-muted">
					{[client.guardian, client.phone].filter((x) => x !== null && x !== "").join(" · ")}
				</span>
				<span class="client-row__next adm-muted">
					{next === null
						? m.cl_list_no_next({}, o)
						: m.cl_list_next({ date: dayLong(locale, next.date), time: hhmm(next.startMin) }, o)}
					{last === null ? null : ` · ${m.cl_list_last({ date: dayLong(locale, last) }, o)}`}
				</span>
			</span>
			<span class="client-row__flags">
				{client.status === "archived" ? (
					<span class="adm-pill adm-pill--cancelled">{m.client_archived_badge({}, o)}</span>
				) : null}
				{owes > 0 ? (
					<span class="adm-pill adm-pill--requested" data-owes>
						{m.cl_list_owes({ sum: formatMoney(owes, locale) }, o)}
					</span>
				) : null}
				{listed === null ? null : <BlacklistBadge entry={listed} locale={locale} short />}
			</span>
		</a>
	);
}

function NewClientSheet({ ctx }: { ctx: Ctx }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="newClient" title={m.ac_client_new({}, o)} closeLabel={m.close({}, o)}>
			<form method="post" action="/clients" class="cl-form" data-form="client-new">
				<label class="adm-field">
					<span>{m.ap_c_name({}, o)}</span>
					<input class="adm-input" name="name" required maxlength={120} autocomplete="off" />
				</label>
				<label class="adm-field">
					<span>{m.guardian_label({}, o)}</span>
					<input class="adm-input" name="guardian" maxlength={120} />
				</label>
				<label class="adm-field">
					<span>{m.phone_label({}, o)}</span>
					<input
						class="adm-input"
						name="phone"
						type="tel"
						inputmode="tel"
						autocomplete="tel"
						maxlength={40}
					/>
				</label>
				<SheetButtons go={m.cl_save({}, o)} signal="newClient" cancel={m.cancel({}, o)} />
			</form>
		</Sheet>
	);
}

/** The page's result, or the failure to read it. */
export type ClientsResult = { ok: true; page: ClientPage } | { ok: false };

/** Reads one page of the list; a failure is the region's error banner, never a broken page. */
export async function readClients(ctx: Ctx, ask: ClientListAsk): Promise<ClientsResult> {
	try {
		return { ok: true, page: await ctx.port.clientPage(ctx.app, ask) };
	} catch {
		return { ok: false };
	}
}

/** The count, the rows and the pager: what a page change, a search or a filter replaces in place. */
export function ClientResults({
	ctx,
	ask,
	result,
}: {
	ctx: Ctx;
	ask: ClientListAsk;
	result: ClientsResult;
}): JSX.Element {
	const o = at(ctx.locale);
	const here = clientsHref(ask, ask.page, ask.size);
	let body: JSX.Element;
	if (!result.ok)
		body = (
			<Banner tone="error" icon="alert">
				<strong>{m.error_title({}, o)}</strong>
				<p>{m.error_text({}, o)}</p>
				<a class="adm-btn" href={here}>
					{m.retry({}, o)}
				</a>
			</Banner>
		);
	else if (result.page.total === 0)
		body = narrowed(ask) ? (
			<EmptyState icon="search" title={m.cl_f_none_title({}, o)} text={m.cl_f_none_text({}, o)}>
				<a
					class="adm-btn"
					href={clientsHref(
						{
							filter: ask.filter,
							q: "",
							sort: "name",
							practitioner: null,
							flag: null,
							pkg: null,
						},
						1,
						ask.size,
					)}
				>
					{m.cl_f_clear({}, o)}
				</a>
			</EmptyState>
		) : (
			<EmptyState
				icon="users"
				title={m.clients_empty_title({}, o)}
				text={
					ctx.viewAs?.as.startsWith("role:") && ctx.can.narrowed("clients_view")
						? m.view_as_role_empty({}, o)
						: m.clients_empty_text({}, o)
				}
			>
				<EmptyActions ctx={ctx} screen="clients" />
			</EmptyState>
		);
	else {
		const { page } = result;
		const by = new Map(page.summaries.map((s) => [s.clientId, s]));
		const params = Object.fromEntries(
			addressParams(ask).flatMap(([k, v]) => (v === null || v === "" ? [] : [[k, v]])),
		);
		body = (
			<>
				<div class="cl-summary" data-summary>
					<StatCard label={m.cl_list_total({}, o)} value={String(page.total)} />
				</div>
				<div class="adm-card client-list" id="client-list">
					{page.clients.map((c) => (
						<ClientRow key={c.id} client={c} summary={by.get(c.id)} ctx={ctx} />
					))}
				</div>
				<ListPager
					ctx={ctx}
					id="client-pager"
					nav={m.cl_pager_nav({}, o)}
					page={page.page}
					size={ask.size}
					total={page.total}
					href={(p, s) => clientsHref(ask, p, s)}
					action="/clients"
					params={params}
				/>
			</>
		);
	}
	return (
		<section
			id={RESULTS_ID}
			class="cl-results"
			tabindex={-1}
			aria-label={m.clients_title({}, o)}
			data-results
		>
			{body}
		</section>
	);
}

/** How many online accounts wait for this person to say which client they are; none when they may not, or on a failure. */
async function waitingLinks(ctx: Ctx): Promise<number> {
	if (!ctx.can.write("clients_invite")) return 0;
	try {
		return (await ctx.port.accountLinks(ctx.app)).length;
	} catch {
		return 0;
	}
}

/** The practitioners the list may be filtered by; none when the team cannot be read (the filter then is not offered). */
export async function practitionersOf(ctx: Ctx): Promise<ReadonlyArray<Column>> {
	try {
		return (await ctx.port.columns(ctx.app)).filter((c) => c.kind === "person");
	} catch {
		return [];
	}
}

export async function renderClients(
	ctx: Ctx,
	ask: ClientListAsk,
	result: ClientsResult,
	openNew = false,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const [waiting, practitioners] = await Promise.all([waitingLinks(ctx), practitionersOf(ctx)]);
	// The page really shown (past the end: the last) is the address the person lands on.
	const shown = result.ok ? { ...ask, page: result.page.page } : ask;
	return Page({
		ctx,
		current: "clients",
		title: m.clients_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.clients_title({}, o)}>
					<ActionBar ctx={ctx} screen="clients" />
				</PageHeader>
				{waiting === 0 ? null : (
					<Banner tone="info" icon="users">
						<span data-account-links>{m.al_banner({ n: String(waiting) }, o)}</span>
						<a class="adm-btn" href="/account-links">
							{m.al_open({}, o)}
						</a>
					</Banner>
				)}
				{/*
				 * Back and Forward land on an address the list pushed: the list follows it in place. The address the page
				 * opened at is made the canonical one first, so following it in place never pushes over the forward history.
				 */}
				<div
					hidden
					data-init={`history.replaceState(null, "", ${JSON.stringify(clientsHref(shown, shown.page, shown.size))})`}
					data-on:popstate__window="@get(location.pathname + location.search)"
				/>
				<ClientFilters ctx={ctx} ask={shown} practitioners={practitioners} />
				<ClientResults ctx={ctx} ask={shown} result={result} />
			</div>
		),
		overlays: (
			<div data-signals={JSON.stringify({ newClient: openNew && ctx.can.write("clients_create") })}>
				{ctx.can.write("clients_create") ? <NewClientSheet ctx={ctx} /> : null}
			</div>
		),
	});
}
