import { Banner, EmptyState, PageHeader, Segmented, Sheet, StatCard, Toolbar } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, EmptyActions } from "../actions/render";
import { Page } from "../chrome";
import { formatMoney } from "../domain/money";
import type { Ctx } from "../lib/context";
import { dayLong, hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { moreHref, ShowMore } from "../lib/show-more";
import { m } from "../paraglide/messages.js";
import type { ClientFilter } from "../port/port";
import type { Client } from "../port/schema";
import type { ClientSummary } from "../port/schema-clinical";
import { BlacklistBadge } from "./client-flags";
import { SheetButtons } from "./client-sheets";

/** One client as a row: monogram, name, who to call, next appointment, balance, and the flags. */
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

/** How many clients the list shows, and whether more follow (announced to screen readers as it grows). */
export function ShownCount({
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
		<p class="adm-muted" aria-live="polite" id="client-count">
			{more ? m.cl_list_shown({ n: String(shown) }, o) : m.clients_count({ n: shown }, o)}
		</p>
	);
}

/** The next page of the list, fetched into the open page (a Datastar patch), or nothing on the last page. */
export function MoreClients({
	ctx,
	filter,
	q,
	cursor,
	shown,
}: {
	ctx: Ctx;
	filter: ClientFilter;
	q: string;
	cursor: string | null;
	shown: number;
}): JSX.Element {
	return (
		<ShowMore
			id="client-more"
			href={moreHref("/clients/more", cursor, shown, q === "" ? { filter } : { filter, q })}
			label={m.cl_list_more({}, at(ctx.locale))}
		/>
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

export async function renderClients(
	ctx: Ctx,
	filter: ClientFilter,
	q: string,
	openNew = false,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let rows: ReadonlyArray<ClientSummary> = [];
	let clients: ReadonlyArray<Client> = [];
	let next: string | null = null;
	let failed = false;
	try {
		// One page: the list never asks for (nor renders) every client at once.
		const page = await ctx.port.clientPage(ctx.app, filter, q, null);
		clients = page.clients;
		rows = page.summaries;
		next = page.nextCursor;
	} catch {
		failed = true;
	}
	const qs = (f: ClientFilter): string =>
		`/clients?filter=${f}${q === "" ? "" : `&q=${encodeURIComponent(q)}`}`;
	const by = new Map(rows.map((r) => [r.clientId, r]));
	// With more pages to come, a count is "at least": n+.
	const count = (n: number): string =>
		next === null ? String(n) : m.cl_list_count_more({ n: String(n) }, o);
	const listedCount = rows.filter((r) => r.blacklist !== null).length;
	const owing = rows.filter((r) => (r.owedBani ?? 0) > 0).length;
	const upcoming = rows.filter((r) => r.next !== null).length;
	const waiting = await waitingLinks(ctx);
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
				{failed || clients.length === 0 ? null : (
					<div class="cl-summary" data-summary>
						<StatCard label={m.cl_list_total({}, o)} value={count(clients.length)} />
						<StatCard label={m.cl_list_upcoming({}, o)} value={count(upcoming)} />
						{ctx.can.group("money") ? (
							<StatCard label={m.cl_list_owing({}, o)} value={count(owing)} />
						) : null}
						{ctx.can.has("blacklist_view") ? (
							<StatCard label={m.cl_list_listed({}, o)} value={count(listedCount)} />
						) : null}
					</div>
				)}
				<Toolbar
					search={
						<form method="get" action="/clients">
							<input type="hidden" name="filter" value={filter} />
							<label class="adm-sr" for="clients-q">
								{m.clients_search_label({}, o)}
							</label>
							<input
								id="clients-q"
								class="adm-input"
								type="search"
								name="q"
								value={q}
								placeholder={m.clients_search_label({}, o)}
							/>
							<button class="adm-btn" type="submit">
								{m.clients_search_go({}, o)}
							</button>
						</form>
					}
				>
					<Segmented
						label={m.filter_label({}, o)}
						current={filter}
						items={[
							{ key: "current", label: m.filter_current({}, o), href: qs("current") },
							{ key: "archived", label: m.filter_archived({}, o), href: qs("archived") },
						]}
					/>
				</Toolbar>
				{failed ? (
					<Banner tone="error" icon="alert">
						<strong>{m.error_title({}, o)}</strong>
						<p>{m.error_text({}, o)}</p>
						<a class="adm-btn" href={qs(filter)}>
							{m.retry({}, o)}
						</a>
					</Banner>
				) : clients.length === 0 ? (
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
				) : (
					<>
						<ShownCount ctx={ctx} shown={clients.length} more={next !== null} />
						<div class="adm-card client-list" id="client-list">
							{clients.map((c) => (
								<ClientRow key={c.id} client={c} summary={by.get(c.id)} ctx={ctx} />
							))}
						</div>
						<MoreClients ctx={ctx} filter={filter} q={q} cursor={next} shown={clients.length} />
					</>
				)}
			</div>
		),
		overlays: (
			<div data-signals={JSON.stringify({ newClient: openNew && ctx.can.write("clients_create") })}>
				{ctx.can.write("clients_create") ? <NewClientSheet ctx={ctx} /> : null}
			</div>
		),
	});
}
