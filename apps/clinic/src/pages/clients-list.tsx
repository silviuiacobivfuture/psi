import { Banner, EmptyState, PageHeader, Segmented, Toolbar } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { ClientFilter } from "../port/port";
import type { Client } from "../port/schema";

export function ClientRow({ c, label }: { c: Client; label: string | null }): JSX.Element {
	return (
		<a class="client-row" href={`/clients/${c.id}`}>
			<span class="adm-avatar client-row__avatar" aria-hidden="true">
				{Array.from(c.name)[0]}
			</span>
			<span class="client-row__main">
				<strong>{c.name}</strong>
				<span class="adm-muted">{[c.guardian, c.phone].filter((x) => x !== null).join(" · ")}</span>
			</span>
			{label !== null ? <span class="adm-pill adm-pill--cancelled">{label}</span> : null}
		</a>
	);
}

export async function renderClients(
	ctx: Ctx,
	filter: ClientFilter,
	q: string,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let clients: ReadonlyArray<Client> = [];
	let failed = false;
	try {
		clients = await ctx.port.clients(ctx.app, filter, q);
	} catch {
		failed = true;
	}
	const qs = (f: ClientFilter): string =>
		`/clients?filter=${f}${q === "" ? "" : `&q=${encodeURIComponent(q)}`}`;
	return Page({
		ctx,
		current: "clients",
		title: m.clients_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.clients_title({}, o)} />
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
						<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
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
					/>
				) : (
					<>
						<p class="adm-muted" aria-live="polite">
							{m.clients_count({ n: clients.length }, o)}
						</p>
						<div class="adm-card client-list">
							{clients.map((c) => (
								<ClientRow
									key={c.id}
									c={c}
									label={c.status === "archived" ? m.client_archived_badge({}, o) : null}
								/>
							))}
						</div>
					</>
				)}
			</div>
		),
	});
}
