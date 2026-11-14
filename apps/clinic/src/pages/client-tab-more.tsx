import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import type { Ctx } from "../lib/context";
import { appendPage, MoreQuery } from "../lib/show-more";
import { offsetPage } from "../port/offset-page";
import { LIST_PAGE, type Paged } from "../port/port";
import { NoteCard, readableNotes } from "./client-notes";
import { AppointmentRow } from "./client-page";
import { RecordRow } from "./client-records";
import { PAGED_TABS, type PagedTab, TabMore, tabListId } from "./client-tab-pager";

/** The next page of one client's list, as the tab draws its rows. */
async function rowsOf(
	ctx: Ctx,
	clientId: string,
	tab: PagedTab,
	cursor: string | null,
): Promise<Paged<JSX.Element>> {
	const page = <T,>(all: ReadonlyArray<T>, row: (item: T) => JSX.Element): Paged<JSX.Element> => {
		const p = offsetPage(all, cursor, LIST_PAGE);
		return { items: p.items.map(row), nextCursor: p.nextCursor };
	};
	switch (tab) {
		case "appointments": {
			const [appointments, services] = await Promise.all([
				ctx.port.clientAppointments(ctx.app, clientId),
				ctx.can.has("services_view") ? ctx.port.services(ctx.app) : [],
			]);
			const names = new Map(services.map((s) => [s.id, s.name]));
			return page(appointments, (a) => (
				<AppointmentRow key={a.id} ctx={ctx} a={a} serviceName={names.get(a.serviceId) ?? ""} />
			));
		}
		case "notes":
			return page(readableNotes(ctx, await ctx.port.notes(ctx.app, clientId)), (n) => (
				<NoteCard key={n.id} ctx={ctx} note={n} />
			));
		case "records": {
			const [records, templates] = await Promise.all([
				ctx.port.records(ctx.app, clientId),
				ctx.port.formTemplates(ctx.app),
			]);
			return page(records, (r) => (
				<RecordRow key={r.id} ctx={ctx} clientId={clientId} r={r} templates={templates} />
			));
		}
		default: {
			const never: never = tab;
			return never;
		}
	}
}

/** A client tab's next page, appended to the open tab: a long history grows a page at a time. */
export function registerClientTabMore(app: Hono<Env>): void {
	for (const tab of PAGED_TABS)
		app.get(`/clients/:id/more/${tab}`, async (c) => {
			const ctx = c.var.ctx;
			const clientId = c.req.param("id");
			const asked = MoreQuery.parse(c.req.query());
			const got = await rowsOf(ctx, clientId, tab, asked.cursor === "" ? null : asked.cursor);
			return appendPage({
				list: `#${tabListId(tab)}`,
				rows: got.items,
				more: (
					<TabMore
						ctx={ctx}
						clientId={clientId}
						tab={tab}
						cursor={got.nextCursor}
						shown={asked.shown + got.items.length}
					/>
				),
			});
		});
}
