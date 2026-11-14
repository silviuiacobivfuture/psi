import { EmptyState, StatusPill } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, EmptyActions } from "../actions/render";
import type { Ctx } from "../lib/context";
import { dayLong, hhmm } from "../lib/dates";
import { at } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import type { Appointment } from "../port/schema";
import { FilesTab } from "./client-files";
import { NotesTab, readableNotes } from "./client-notes";
import type { ClientView } from "./client-page";
import { RecordsTab } from "./client-records";
import { cutTab, type PagedTab, TabPager, tabRegionId } from "./client-tab-pager";
import { PackagesTab } from "./packages-tab";

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

/** The client's appointments, a numbered page at a time. */
function AppointmentsTab({ ctx, view }: { ctx: Ctx; view: ClientView }): JSX.Element {
	const o = at(ctx.locale);
	const entity = { clientId: view.client.id };
	const services = new Map(view.services.map((s) => [s.id, s.name]));
	const shown = cutTab(view.appointments, view.paging);
	return (
		<div class="cl-tab">
			<ActionBar ctx={ctx} screen="client.appointments" entity={entity} />
			{shown.total === 0 ? (
				<EmptyState icon="calendar" title={m.appointments_none({}, o)}>
					<EmptyActions ctx={ctx} screen="client.appointments" entity={entity} />
				</EmptyState>
			) : (
				<ul class="cl-rows" aria-label={m.tab_appointments({}, o)}>
					{shown.items.map((a) => (
						<AppointmentRow
							key={a.id}
							ctx={ctx}
							a={a}
							serviceName={services.get(a.serviceId) ?? ""}
						/>
					))}
				</ul>
			)}
			<TabPager
				ctx={ctx}
				clientId={view.client.id}
				tab="appointments"
				shown={shown}
				size={view.paging.size}
			/>
		</div>
	);
}

/** The body of a paged tab (what a page change replaces in place), or the "în curând" state. */
function Body({ ctx, view, tab }: { ctx: Ctx; view: ClientView; tab: PagedTab }): JSX.Element {
	const o = at(ctx.locale);
	const soon = tab !== "appointments" && tab !== "packages" && view.soon.includes(tab);
	if (soon)
		return <EmptyState icon="clock" title={m.soon_title({}, o)} text={m.soon_text({}, o)} />;
	const { client } = view;
	switch (tab) {
		case "appointments":
			return <AppointmentsTab ctx={ctx} view={view} />;
		case "notes":
			return <NotesTab ctx={ctx} notes={view.notes} clientId={client.id} paging={view.paging} />;
		case "records":
			return (
				<RecordsTab
					ctx={ctx}
					clientId={client.id}
					records={view.records}
					templates={view.templates}
					paging={view.paging}
				/>
			);
		case "files":
			return (
				<FilesTab
					ctx={ctx}
					clientId={client.id}
					shown={view.files}
					size={view.paging.size}
					notice={view.open.fileNotice}
				/>
			);
		case "packages":
			return (
				<PackagesTab
					ctx={ctx}
					view={{
						client,
						packages: view.packages,
						appointments: view.appointments,
						services: view.services,
						notice: view.notice ?? null,
					}}
					paging={view.paging}
					canCreate={ctx.can.write("packages_create")}
					canEdit={ctx.can.write("packages_edit")}
					canPay={ctx.can.write("payments_create")}
				/>
			);
		default: {
			const never: never = tab;
			return never;
		}
	}
}

/** The page of a tab really shown (a page past the end shows the last): the address the person lands on. */
export function shownPage(ctx: Ctx, view: ClientView, tab: PagedTab): number {
	switch (tab) {
		case "appointments":
			return cutTab(view.appointments, view.paging).page;
		case "notes":
			return cutTab(readableNotes(ctx, view.notes), view.paging).page;
		case "records":
			return cutTab(view.records, view.paging).page;
		case "files":
			return view.files.page;
		case "packages":
			return cutTab(view.packages, view.paging).page;
		default: {
			const never: never = tab;
			return never;
		}
	}
}

/** A paged tab in the region a page change replaces and focuses. */
export function PagedTabBody({
	ctx,
	view,
	tab,
}: {
	ctx: Ctx;
	view: ClientView;
	tab: PagedTab;
}): JSX.Element {
	return (
		<section id={tabRegionId(tab)} class="cl-tab-region" tabindex={-1} data-tab-region={tab}>
			<Body ctx={ctx} view={view} tab={tab} />
		</section>
	);
}
