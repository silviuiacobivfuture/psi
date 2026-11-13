import {
	Banner,
	EmptyState,
	Icon,
	OverflowMenu,
	Sheet,
	StatusPill,
	type Tab,
	Tabs,
} from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import { ledger } from "../domain/ledger";
import { formatMoney } from "../domain/money";
import { paidBani } from "../domain/usage";
import type { Ctx } from "../lib/context";
import { dayLong, hhmm } from "../lib/dates";
import { CLIENT_TAB_KEYS } from "../lib/gates";
import { at, type Locale } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import type { PortError } from "../port/port";
import type { Appointment, Client, Invite, Package, Service } from "../port/schema";
import { InviteCard, inviteErrorText, RevokeSheet } from "./invite-page";
import { NewPackageSheet, PackagesTab } from "./packages-tab";

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
	/** The online-account invitation; `undefined` when this person may not see it (no `clients_invite`). */
	invite?: Invite | null | undefined;
	/** A refusal of the last resend or withdrawal, to show above the page. */
	inviteError?: PortError | null | undefined;
	appointments: ReadonlyArray<Appointment>;
	packages: ReadonlyArray<Package>;
	services: ReadonlyArray<Service>;
	notice?: "invalid" | "made" | null;
}

export async function renderClient(
	ctx: Ctx,
	view: ClientView,
	flash?: string,
): Promise<JSX.Element> {
	const { client, tab } = view;
	const o = at(ctx.locale);
	// A tab the person may not open is not offered: no clinical tab without clinical, no packages without money.
	const open = CLIENT_TABS.filter((t) => ctx.can.has(CLIENT_TAB_KEYS[t]));
	const tabs: Tab[] = open.map((t) => ({
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
				{view.inviteError === null || view.inviteError === undefined ? null : (
					<Banner tone="error" icon="alert">
						{inviteErrorText(view.inviteError, ctx.locale)}
					</Banner>
				)}
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
					<OverflowMenu
						id="client-actions"
						label={m.client_more({}, o)}
						items={[
							...(client.status === "archived" || !ctx.can.write("clients_archive")
								? []
								: [
										{
											key: "archive",
											label: m.archive_button({}, o),
											icon: "archive" as const,
											onClick: "$askArchive = true",
										},
									]),
							...(ctx.can.write("clients_delete")
								? [
										{
											key: "delete",
											label: m.delete_button({}, o),
											icon: "trash" as const,
											tone: "danger" as const,
											onClick: "$askDelete = true",
										},
									]
								: []),
						]}
					/>
				</div>
				<Tabs tabs={tabs} selected={tab} label={m.tabs_label({}, o)} />
				{tab === "overview" ? <Overview client={client} ctx={ctx} view={view} /> : null}
				{tab === "appointments" && open.includes("appointments") ? (
					<AppointmentsTab view={view} locale={ctx.locale} />
				) : null}
				{tab === "packages" && open.includes("packages") ? (
					<PackagesTab
						view={{
							client,
							packages: view.packages,
							appointments: view.appointments,
							services: view.services,
							notice: view.notice ?? null,
						}}
						locale={ctx.locale}
						canCreate={ctx.can.write("packages_create")}
						canEdit={ctx.can.write("packages_edit")}
						canPay={ctx.can.write("payments_create")}
					/>
				) : null}
				{tab === "records" && open.includes("records") ? (
					<EmptyState
						icon="file"
						title={m.records_empty_title({}, o)}
						text={m.records_empty_text({}, o)}
					/>
				) : null}
				{tab === "files" && open.includes("files") ? (
					<EmptyState
						icon="archive"
						title={m.files_empty_title({}, o)}
						text={m.files_empty_text({}, o)}
					/>
				) : null}
			</div>
		),
		overlays: (
			<div data-signals="{askArchive:false,askDelete:false,newPkg:false,askRevoke:false}">
				{view.invite === undefined ||
				view.invite === null ||
				!ctx.can.write("clients_invite") ? null : (
					<RevokeSheet client={client} locale={ctx.locale} />
				)}
				{client.status === "archived" ? null : (
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
				)}
				{ctx.can.write("packages_create") ? (
					<NewPackageSheet client={client} services={view.services} locale={ctx.locale} />
				) : null}
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
		(sum, p) => sum + Math.max(0, ledger(p.totalBani, paidBani(p)).remainingBani),
		0,
	);
	return (
		<div class="adm-grid">
			<div class="adm-card adm-stack">
				<h3 class="adm-h2">{m.tab_overview({}, o)}</h3>
				{ctx.can.group("guardian") ? (
					<Field label={m.guardian_label({}, o)} value={client.guardian} />
				) : null}
				{ctx.can.group("contact") ? (
					<>
						<Field label={m.phone_label({}, o)} value={client.phone} />
						<Field label={m.email_label({}, o)} value={client.email} />
					</>
				) : null}
				{ctx.can.group("clinical") ? (
					<Field label={m.note_label({}, o)} value={client.note} />
				) : null}
			</div>
			{view.invite === undefined ? null : (
				<InviteCard
					client={client}
					invite={view.invite}
					locale={ctx.locale}
					canWrite={ctx.can.write("clients_invite") && client.status === "current"}
				/>
			)}
			{ctx.can.has("packages_view") && ctx.can.group("money") ? (
				<div class="adm-card adm-stack">
					<h3 class="adm-h2">{m.tab_packages({}, o)}</h3>
					<Field label={m.pkg_remaining({}, o)} value={formatMoney(owed, ctx.locale)} />
					<a class="adm-btn" href={`/clients/${client.id}/packages`}>
						{m.packages_title({}, o)}
					</a>
				</div>
			) : null}
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
