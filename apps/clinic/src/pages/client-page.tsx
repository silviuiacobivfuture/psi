import { Banner, EmptyState, Icon, Sheet, StatusPill, type Tab, Tabs } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import { ledger, sessionsLeft } from "../domain/ledger";
import { formatMoney } from "../domain/money";
import type { Ctx } from "../lib/context";
import { dayLong, hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import type { Appointment, Client, Package } from "../port/schema";
import { PackageCard } from "./packages-view";

export type ClientTab = "overview" | "appointments" | "packages" | "records" | "files";
export const CLIENT_TABS: ReadonlyArray<ClientTab> = [
	"overview",
	"appointments",
	"packages",
	"records",
	"files",
];

const tabLabel = (t: ClientTab, locale: Locale): string => {
	const o = at(locale);
	switch (t) {
		case "overview":
			return m.tab_overview({}, o);
		case "appointments":
			return m.tab_appointments({}, o);
		case "packages":
			return m.tab_packages({}, o);
		case "records":
			return m.tab_records({}, o);
		case "files":
			return m.tab_files({}, o);
		default: {
			const never: never = t;
			return never;
		}
	}
};

function Field({ label, value }: { label: string; value: string | null }): JSX.Element {
	return (
		<div class="adm-stack" style="gap:2px">
			<span class="adm-muted">{label}</span>
			<strong>{value === null || value === "" ? "—" : value}</strong>
		</div>
	);
}

function Confirm({
	signal,
	title,
	text,
	go,
	danger,
	action,
	closeLabel,
	cancelLabel,
}: {
	signal: string;
	title: string;
	text: string;
	go: string;
	danger: boolean;
	action: string;
	closeLabel: string;
	cancelLabel: string;
}): JSX.Element {
	return (
		<Sheet signal={signal} title={title} closeLabel={closeLabel}>
			<form method="post" action={action} class="adm-stack">
				<p>{text}</p>
				<div class="adm-row">
					<button
						class={danger ? "adm-btn adm-btn--danger" : "adm-btn adm-btn--primary"}
						type="submit"
					>
						{go}
					</button>
					<button class="adm-btn" type="button" data-on:click={`$${signal} = false`}>
						{cancelLabel}
					</button>
				</div>
			</form>
		</Sheet>
	);
}

export interface ClientView {
	client: Client;
	tab: ClientTab;
	appointments: ReadonlyArray<Appointment>;
	packages: ReadonlyArray<Package>;
	services: ReadonlyArray<{ id: string; name: string }>;
}

export async function renderClient(
	ctx: Ctx,
	view: ClientView,
	flash?: string,
): Promise<JSX.Element> {
	const { client, tab } = view;
	const o = at(ctx.locale);
	const tabs: Tab[] = CLIENT_TABS.map((t) => ({
		key: t,
		label: tabLabel(t, ctx.locale),
		href: `/clients/${client.id}${t === "overview" ? "" : `/${t}`}`,
	}));
	return Page({
		ctx,
		current: "clients",
		title: client.name,
		children: (
			<div class="adm-page" data-signals="{askArchive:false,askDelete:false}">
				<a class="adm-btn adm-btn--ghost" style="align-self:flex-start" href="/clients">
					<Icon name="chevron-left" />
					{m.client_back({}, o)}
				</a>
				{flash === undefined ? null : (
					<Banner tone="info" icon="check">
						{flash}
					</Banner>
				)}
				<div class="adm-pagehead">
					<div class="adm-row">
						<span
							class="adm-avatar"
							style="width:48px;height:48px;font-size:18px"
							aria-hidden="true"
						>
							{Array.from(client.name)[0]}
						</span>
						<div>
							<h2 class="adm-h1">{client.name}</h2>
							{client.status === "archived" ? (
								<span class="adm-pill adm-pill--cancelled">{m.client_archived_badge({}, o)}</span>
							) : null}
						</div>
					</div>
					<div class="adm-row">
						{client.status === "archived" ? null : (
							<button type="button" class="adm-btn" data-on:click="$askArchive = true">
								<Icon name="archive" />
								{m.archive_button({}, o)}
							</button>
						)}
						<button type="button" class="adm-btn adm-btn--danger" data-on:click="$askDelete = true">
							<Icon name="trash" />
							{m.delete_button({}, o)}
						</button>
					</div>
				</div>
				<Tabs tabs={tabs} selected={tab} label={m.tabs_label({}, o)} />
				{tab === "overview" ? <Overview client={client} ctx={ctx} view={view} /> : null}
				{tab === "appointments" ? <AppointmentsTab view={view} locale={ctx.locale} /> : null}
				{tab === "packages" ? <PackagesTab view={view} locale={ctx.locale} /> : null}
				{tab === "records" ? (
					<EmptyState
						icon="file"
						title={m.records_empty_title({}, o)}
						text={m.records_empty_text({}, o)}
					/>
				) : null}
				{tab === "files" ? (
					<EmptyState
						icon="archive"
						title={m.files_empty_title({}, o)}
						text={m.files_empty_text({}, o)}
					/>
				) : null}
			</div>
		),
		overlays: (
			<div data-signals="{askArchive:false,askDelete:false}">
				<Confirm
					signal="askArchive"
					title={m.archive_confirm_title({}, o)}
					text={m.archive_confirm_text({ name: client.name }, o)}
					go={m.archive_confirm_go({}, o)}
					danger={false}
					action={`/clients/${client.id}/archive`}
					closeLabel={m.close({}, o)}
					cancelLabel={m.cancel({}, o)}
				/>
				<Confirm
					signal="askDelete"
					title={m.delete_confirm_title({}, o)}
					text={m.delete_confirm_text({ name: client.name }, o)}
					go={m.delete_confirm_go({}, o)}
					danger
					action={`/clients/${client.id}/delete`}
					closeLabel={m.close({}, o)}
					cancelLabel={m.cancel({}, o)}
				/>
			</div>
		),
	});
}

function Overview({
	client,
	ctx,
	view,
}: {
	client: Client;
	ctx: Ctx;
	view: ClientView;
}): JSX.Element {
	const o = at(ctx.locale);
	const owed = view.packages.reduce(
		(sum, p) => sum + Math.max(0, ledger(p.totalBani, p.paidBani).remainingBani),
		0,
	);
	return (
		<div class="adm-grid">
			<div class="adm-card adm-stack">
				<h3 class="adm-h2">{m.tab_overview({}, o)}</h3>
				<Field label={m.guardian_label({}, o)} value={client.guardian} />
				<Field label={m.phone_label({}, o)} value={client.phone} />
				<Field label={m.email_label({}, o)} value={client.email} />
				<Field label={m.note_label({}, o)} value={client.note} />
			</div>
			<div class="adm-card adm-stack">
				<h3 class="adm-h2">{m.tab_packages({}, o)}</h3>
				<Field label={m.pkg_remaining({}, o)} value={formatMoney(owed, ctx.locale)} />
				<a class="adm-btn" href={`/clients/${client.id}/packages`}>
					{m.packages_title({}, o)}
				</a>
			</div>
		</div>
	);
}

function AppointmentsTab({ view, locale }: { view: ClientView; locale: Locale }): JSX.Element {
	const o = at(locale);
	if (view.appointments.length === 0)
		return <EmptyState icon="calendar" title={m.appointments_none({}, o)} />;
	return (
		<div class="adm-scroll">
			<table class="adm-table">
				<tbody>
					{view.appointments.map((a) => (
						<tr key={a.id}>
							<td>{dayLong(locale, a.date)}</td>
							<td>
								{hhmm(a.startMin)}–{hhmm(a.startMin + a.durationMin)}
							</td>
							<td>{view.services.find((s) => s.id === a.serviceId)?.name ?? ""}</td>
							<td>
								<StatusPill status={a.status} label={statusLabel(a.status, locale)} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function PackagesTab({ view, locale }: { view: ClientView; locale: Locale }): JSX.Element {
	const o = at(locale);
	if (view.packages.length === 0)
		return <EmptyState icon="package" title={m.packages_none({}, o)} />;
	return (
		<div class="adm-stack" style="gap:var(--space-3)">
			{view.packages.map((p) => (
				<PackageCard
					key={p.id}
					clientId={view.client.id}
					pkg={p}
					locale={locale}
					left={sessionsLeft(p.sessions, p.bonus, p.used)}
				/>
			))}
		</div>
	);
}
