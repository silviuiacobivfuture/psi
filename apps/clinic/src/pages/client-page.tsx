import type { FormDefinition } from "@psi/scheduling/clinic";
import { Banner, EmptyState, Icon, OverflowMenu, StatusPill, type Tab, Tabs } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, EmptyActions, menuItems, paletteItems } from "../actions/render";
import { Page } from "../chrome";
import { ledger } from "../domain/ledger";
import { formatMoney } from "../domain/money";
import { paidBani } from "../domain/usage";
import type { Ctx } from "../lib/context";
import { dayLong, hhmm, todayIso } from "../lib/dates";
import { CLIENT_TAB_KEYS } from "../lib/gates";
import { at, type Locale } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import { offsetPage } from "../port/offset-page";
import { LIST_PAGE, type PortError } from "../port/port";
import type { Appointment, Client, Invite, Package, Service } from "../port/schema";
import {
	type BlacklistEntry,
	blacklistActive,
	type ClientFile,
	type ClientNote,
	type ClientRecord,
} from "../port/schema-clinical";
import { FilesTab, RenameSheet, UploadSheet } from "./client-files";
import {
	BlacklistBadge,
	blacklistCategoryText,
	noteCategoryText,
	severityText,
} from "./client-flags";
import { NoteSheet, NotesTab, readableNotes, stampText } from "./client-notes";
import { RecordsTab } from "./client-records";
import { BlacklistSheet, ConfirmSheet, EditClientSheet, UnlistSheet } from "./client-sheets";
import { TabMore, tabListId } from "./client-tab-pager";
import { InviteCard, inviteErrorText, RevokeSheet } from "./invite-page";
import { NewPackageSheet, PackagesTab } from "./packages-tab";

export type ClientTab = "overview" | "notes" | "appointments" | "packages" | "records" | "files";
export const CLIENT_TABS: ReadonlyArray<ClientTab> = [
	"overview",
	"notes",
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
		case "notes":
			return m.cl_tab_notes({}, o);
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

/** What the address asks the page to open on arrival (a sheet, a confirmation). */
export interface ClientOpen {
	newNote: boolean;
	newFile: boolean;
	edit: boolean;
	editNote: string | null;
	rename: string | null;
	confirm: { action: string; id: string } | null;
	fileNotice: "invalid" | "too-big" | null;
}

/** What the service keeps no route for yet: its tab says "în curând". */
export type Soon = "notes" | "blacklist" | "records" | "files";

export interface ClientView {
	soon: ReadonlyArray<Soon>;
	client: Client;
	tab: ClientTab;
	/** The online-account invitation; `undefined` when this person may not see it (no `clients_invite`). */
	invite?: Invite | null | undefined;
	/** A refusal of the last resend or withdrawal, to show above the page. */
	inviteError?: PortError | null | undefined;
	appointments: ReadonlyArray<Appointment>;
	packages: ReadonlyArray<Package>;
	services: ReadonlyArray<Service>;
	notes: ReadonlyArray<ClientNote>;
	blacklist: ReadonlyArray<BlacklistEntry>;
	records: ReadonlyArray<ClientRecord>;
	/** The first page of the files, and where the next starts (null: the last is shown). */
	files: ReadonlyArray<ClientFile>;
	filesNext: string | null;
	/** The file whose rename sheet is open (asked by id: it may be on a page not shown yet). */
	renaming: ClientFile | null;
	templates: ReadonlyArray<FormDefinition>;
	open: ClientOpen;
	notice?: "invalid" | "made" | null;
}

function Field({ label, value }: { label: string; value: string | null }): JSX.Element {
	return (
		<div class="cl-field-read">
			<span class="adm-muted">{label}</span>
			<strong>{value === null || value === "" ? "—" : value}</strong>
		</div>
	);
}

const activeEntry = (entries: ReadonlyArray<BlacklistEntry>): BlacklistEntry | null =>
	entries.find((e) => blacklistActive(e, todayIso())) ?? null;

export async function renderClient(
	ctx: Ctx,
	view: ClientView,
	flash?: string,
): Promise<JSX.Element> {
	const { client, tab } = view;
	const o = at(ctx.locale);
	const open = CLIENT_TABS.filter((t) => ctx.can.has(CLIENT_TAB_KEYS[t]));
	const tabs: Tab[] = open.map((t) => ({
		key: t,
		label: tabLabel(t, ctx.locale),
		href: `/clients/${client.id}${t === "overview" ? "" : `/${t}`}`,
	}));
	const listed = ctx.can.has("blacklist_view") ? activeEntry(view.blacklist) : null;
	const entity = {
		clientId: client.id,
		clientArchived: client.status === "archived",
		blacklistId: listed?.id ?? null,
	};
	const pinned = readableNotes(ctx, view.notes).filter((n) => n.pinned);
	const editingNote =
		view.open.editNote === null
			? null
			: (view.notes.find((n) => n.id === view.open.editNote) ?? null);
	const renaming = view.renaming;
	const confirm = view.open.confirm;
	const signals = {
		askArchive: false,
		askDelete: false,
		askBlacklist: false,
		askUnlist: false,
		newPkg: false,
		askRevoke: false,
		editClient: view.open.edit,
		newNote: view.open.newNote,
		editNote: editingNote !== null,
		newFile: view.open.newFile,
		renameFile: renaming !== null,
		askItem: confirm !== null,
	};
	return Page({
		ctx,
		current: "clients",
		title: client.name,
		palette: paletteItems(ctx, ["client"], entity),
		children: (
			<div class="adm-page cl-page">
				{view.inviteError === null || view.inviteError === undefined ? null : (
					<Banner tone="error" icon="alert">
						{inviteErrorText(view.inviteError, ctx.locale)}
					</Banner>
				)}
				<a class="adm-btn adm-btn--ghost cl-back" href="/clients">
					<Icon name="chevron-left" />
					{m.client_back({}, o)}
				</a>
				{flash === undefined ? null : (
					<Banner tone="info" icon="check">
						{flash}
					</Banner>
				)}
				<header class="cl-head">
					<span class="adm-avatar cl-head__avatar" aria-hidden="true">
						{Array.from(client.name)[0]}
					</span>
					<div class="cl-head__text">
						<h1 class="adm-h1 cl-head__name">{client.name}</h1>
						<div class="cl-head__flags">
							{client.status === "archived" ? (
								<span class="adm-pill adm-pill--cancelled">{m.client_archived_badge({}, o)}</span>
							) : null}
							{listed === null ? null : <BlacklistBadge entry={listed} locale={ctx.locale} />}
						</div>
					</div>
					<OverflowMenu
						id="client-actions"
						label={m.client_more({}, o)}
						items={menuItems(ctx, "client", entity)}
					/>
				</header>
				{pinned.length === 0 ? null : (
					<section class="cl-pinned-strip" aria-label={m.cl_note_pinned({}, o)} data-pinned-strip>
						{pinned.map((n) => (
							<Banner key={n.id} tone="info" icon="alert">
								<div class="cl-pin">
									<strong>{noteCategoryText(n.category, ctx.locale)}</strong>
									<span>{n.body}</span>
								</div>
							</Banner>
						))}
					</section>
				)}
				<Tabs tabs={tabs} selected={tab} label={m.tabs_label({}, o)} />
				{tab === "overview" ? (
					<Overview ctx={ctx} view={view} entity={entity} listed={listed} />
				) : null}
				{(tab === "notes" && view.soon.includes("notes")) ||
				(tab === "records" && view.soon.includes("records")) ||
				(tab === "files" && view.soon.includes("files")) ? (
					<EmptyState icon="clock" title={m.soon_title({}, o)} text={m.soon_text({}, o)} />
				) : null}
				{tab === "notes" && open.includes("notes") && !view.soon.includes("notes") ? (
					<NotesTab ctx={ctx} notes={view.notes} clientId={client.id} />
				) : null}
				{tab === "appointments" && open.includes("appointments") ? (
					<AppointmentsTab ctx={ctx} view={view} />
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
				{tab === "records" && open.includes("records") && !view.soon.includes("records") ? (
					<RecordsTab
						ctx={ctx}
						clientId={client.id}
						records={view.records}
						templates={view.templates}
					/>
				) : null}
				{tab === "files" && open.includes("files") && !view.soon.includes("files") ? (
					<FilesTab
						ctx={ctx}
						clientId={client.id}
						files={view.files}
						next={view.filesNext}
						notice={view.open.fileNotice}
					/>
				) : null}
			</div>
		),
		overlays: (
			<div data-signals={JSON.stringify(signals)}>
				{view.invite === undefined ||
				view.invite === null ||
				!ctx.can.write("clients_invite") ? null : (
					<RevokeSheet client={client} locale={ctx.locale} />
				)}
				{client.status === "archived" ? null : (
					<ConfirmSheet
						ctx={ctx}
						signal="askArchive"
						title={m.archive_confirm_title({}, o)}
						text={m.archive_confirm_text({ name: client.name }, o)}
						go={m.archive_confirm_go({}, o)}
						danger={false}
						action={`/clients/${client.id}/archive`}
						hidden={{ id: client.id }}
					/>
				)}
				<ConfirmSheet
					ctx={ctx}
					signal="askDelete"
					title={m.delete_confirm_title({}, o)}
					text={m.delete_confirm_text({ name: client.name }, o)}
					go={m.delete_confirm_go({}, o)}
					danger
					action={`/clients/${client.id}/delete`}
					hidden={{ id: client.id }}
				/>
				{ctx.can.write("clients_edit") ? <EditClientSheet ctx={ctx} client={client} /> : null}
				{ctx.can.write("packages_create") ? (
					<NewPackageSheet client={client} services={view.services} locale={ctx.locale} />
				) : null}
				{ctx.can.write("clients_edit") ? (
					<NoteSheet ctx={ctx} clientId={client.id} editing={editingNote} />
				) : null}
				{ctx.can.write("files_upload") ? <UploadSheet ctx={ctx} clientId={client.id} /> : null}
				{renaming === null ? null : <RenameSheet ctx={ctx} clientId={client.id} file={renaming} />}
				{ctx.can.write("blacklist_create") || ctx.can.write("blacklist_create_warn") ? (
					<BlacklistSheet ctx={ctx} client={client} />
				) : null}
				{listed === null || !ctx.can.write("blacklist_edit") ? null : (
					<UnlistSheet ctx={ctx} client={client} entry={listed} />
				)}
				{confirm === null ? null : (
					<ConfirmSheet
						ctx={ctx}
						signal="askItem"
						title={m.cl_confirm_title({}, o)}
						text={m.cl_confirm_text({}, o)}
						go={m.cl_confirm_go({}, o)}
						danger
						action={`/clients/${client.id}/${confirm.action === "note.delete" ? "notes" : confirm.action === "file.delete" ? "files" : "records"}/${confirm.id}/delete`}
						hidden={{ clientId: client.id, id: confirm.id }}
					/>
				)}
			</div>
		),
	});
}

function Overview({
	ctx,
	view,
	entity,
	listed,
}: {
	ctx: Ctx;
	view: ClientView;
	entity: { clientId: string; clientArchived: boolean; blacklistId: string | null };
	listed: BlacklistEntry | null;
}): JSX.Element {
	const o = at(ctx.locale);
	const { client } = view;
	const owed = view.packages.reduce(
		(sum, p) => sum + Math.max(0, ledger(p.totalBani, paidBani(p)).remainingBani),
		0,
	);
	const history = view.blacklist.filter((e) => e !== listed);
	const bare = [client.phone, client.email, client.guardian].every((v) => v === null || v === "");
	return (
		<div class="cl-tab">
			<ActionBar ctx={ctx} screen="client.overview" entity={entity} />
			<div class="cl-cards">
				<section class="adm-card cl-card">
					<h2 class="adm-h2">{m.tab_overview({}, o)}</h2>
					{bare ? (
						<EmptyState icon="user" title={m.cl_overview_bare({}, o)}>
							<EmptyActions ctx={ctx} screen="client.overview" entity={entity} />
						</EmptyState>
					) : null}
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
				</section>
				{ctx.can.has("packages_view") && ctx.can.group("money") ? (
					<section class="adm-card cl-card">
						<h2 class="adm-h2">{m.tab_packages({}, o)}</h2>
						<Field label={m.pkg_remaining({}, o)} value={formatMoney(owed, ctx.locale)} />
						<a class="adm-btn" href={`/clients/${client.id}/packages`}>
							{m.packages_title({}, o)}
						</a>
					</section>
				) : null}
				{listed === null ? null : (
					<section class="adm-card cl-card cl-card--alert" data-blacklist-card>
						<h2 class="adm-h2">{m.cl_blacklist_title({}, o)}</h2>
						<BlacklistBadge entry={listed} locale={ctx.locale} />
						<Field
							label={m.cl_bl_category({}, o)}
							value={blacklistCategoryText(listed.category, ctx.locale)}
						/>
						<Field
							label={m.cl_bl_severity({}, o)}
							value={severityText(listed.severity, ctx.locale)}
						/>
						<Field
							label={m.cl_bl_since({}, o)}
							value={`${stampText(ctx.locale, listed.createdAt)} · ${listed.createdBy}`}
						/>
						{listed.expiresOn === null ? null : (
							<Field label={m.cl_bl_expires({}, o)} value={dayLong(ctx.locale, listed.expiresOn)} />
						)}
						<ActionBar ctx={ctx} screen="client.overview" placement="screen" entity={entity} />
					</section>
				)}
			</div>
			{history.length === 0 || !ctx.can.has("blacklist_view") ? null : (
				<section class="adm-card cl-card" data-blacklist-history>
					<h2 class="adm-h2">{m.cl_bl_history({}, o)}</h2>
					<ul class="cl-rows">
						{history.map((e) => (
							<li key={e.id} class="cl-row">
								<div class="cl-row__main">
									<strong>
										{severityText(e.severity, ctx.locale)} ·{" "}
										{blacklistCategoryText(e.category, ctx.locale)}
									</strong>
									<span class="adm-muted">
										{e.reason} — {stampText(ctx.locale, e.createdAt)}
										{e.endedAt === null
											? ""
											: ` → ${stampText(ctx.locale, e.endedAt)} (${e.endedBy ?? ""}${e.endReason === null ? "" : `: ${e.endReason}`})`}
									</span>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}
			{view.invite === undefined ? null : (
				<InviteCard
					client={client}
					invite={view.invite}
					locale={ctx.locale}
					canWrite={ctx.can.write("clients_invite") && client.status === "current"}
				/>
			)}
		</div>
	);
}

/** One of the client's appointments: when, what, its status; opens it on the calendar. */
export function AppointmentRow({
	ctx,
	a,
	serviceName,
}: {
	ctx: Ctx;
	a: Appointment;
	serviceName: string;
}): JSX.Element {
	return (
		<li class="cl-row" data-appointment={a.id}>
			<a class="cl-row__main" href={`/calendar?view=day&date=${a.date}&appt=${a.id}`}>
				<strong>{dayLong(ctx.locale, a.date)}</strong>
				<span class="adm-muted">
					{hhmm(a.startMin)}–{hhmm(a.startMin + a.durationMin)} · {serviceName}
				</span>
			</a>
			<StatusPill status={a.status} label={statusLabel(a.status, ctx.locale)} />
		</li>
	);
}

/** The client's appointments, a page at a time. */
function AppointmentsTab({ ctx, view }: { ctx: Ctx; view: ClientView }): JSX.Element {
	const o = at(ctx.locale);
	const entity = { clientId: view.client.id };
	const services = new Map(view.services.map((s) => [s.id, s.name]));
	const page = offsetPage(view.appointments, null, LIST_PAGE);
	return (
		<div class="cl-tab">
			<ActionBar ctx={ctx} screen="client.appointments" entity={entity} />
			{view.appointments.length === 0 ? (
				<EmptyState icon="calendar" title={m.appointments_none({}, o)}>
					<EmptyActions ctx={ctx} screen="client.appointments" entity={entity} />
				</EmptyState>
			) : (
				<>
					<ul class="cl-rows" id={tabListId("appointments")} aria-label={m.tab_appointments({}, o)}>
						{page.items.map((a) => (
							<AppointmentRow
								key={a.id}
								ctx={ctx}
								a={a}
								serviceName={services.get(a.serviceId) ?? ""}
							/>
						))}
					</ul>
					<TabMore
						ctx={ctx}
						clientId={view.client.id}
						tab="appointments"
						cursor={page.nextCursor}
						shown={page.items.length}
					/>
				</>
			)}
		</div>
	);
}
