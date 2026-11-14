import type { Context, Hono } from "hono";
import type { Env } from "../app";
import { Page } from "../chrome";
import { at } from "../lib/i18n";
import {
	inPlace,
	PageParams,
	type PageSize,
	pageAsked,
	patchList,
	rememberSize,
	sizeOf,
} from "../lib/paging";
import { m } from "../paraglide/messages.js";
import { type Numbered, PortError } from "../port/port";
import { CLEARABLE_FIELDS, type ClientFile } from "../port/schema-clinical";
import { registerClientActions } from "./client-action-routes";
import {
	CLIENT_TABS,
	type ClientOpen,
	type ClientTab,
	type ClientView,
	renderClient,
	type Soon,
} from "./client-page";
import { PagedTabBody, shownPage } from "./client-tab-body";
import { isPagedTab, tabHref, tabRegionId } from "./client-tab-pager";
import { ClientFilters } from "./clients-filters";
import {
	ClientResults,
	practitionersOf,
	RESULTS_ID,
	readClients,
	renderClients,
} from "./clients-list";
import { askOf, clientsHref, parseClients } from "./clients-query";
import { inviteErrorFrom, inviteFlash, registerInviteRoutes } from "./invite-routes";
import { registerPackageRoutes } from "./package-routes";

function noticeOf(
	invalid: string | undefined,
	made: string | undefined,
): "invalid" | "made" | null {
	return invalid === "invalid" ? "invalid" : made === undefined ? null : "made";
}

const CONFIRMABLE = new Set(["note.delete", "file.delete", "record.delete"]);

/** What the address asks the page to open on arrival. */
function openOf(c: Context<Env>, tab: ClientTab): ClientOpen {
	const q = (k: string): string | undefined => c.req.query(k);
	const confirmAction = q("confirm");
	const upload = q("upload");
	return {
		newNote: tab === "notes" && q("new") === "1",
		newFile: tab === "files" && q("new") === "1",
		edit: tab === "overview" && q("edit") === "1",
		editNote: tab === "notes" ? (q("edit") ?? null) : null,
		rename: tab === "files" ? (q("rename") ?? null) : null,
		confirm:
			confirmAction !== undefined && CONFIRMABLE.has(confirmAction) && q("id") !== undefined
				? { action: confirmAction, id: q("id") ?? "" }
				: null,
		fileNotice: upload === "invalid" || upload === "too-big" ? upload : null,
		contact:
			tab !== "overview"
				? null
				: q("problem") === "contact"
					? "required"
					: (CLEARABLE_FIELDS.find((f) => f === q("cleared")) ?? null),
	};
}

export function registerClients(app: Hono<Env>): void {
	// One address for the whole list: a page load answers the page, Datastar's in-place fetch of the same address the
	// patches (the results, and the filters unless they asked), so back, refresh and a shared link land on that page.
	app.get("/clients", async (c) => {
		const ctx = c.var.ctx;
		const asked = parseClients(c.req.query());
		const ask = await askOf(ctx, asked);
		await rememberSize(ctx, asked.paging, ask.size as PageSize);
		const result = await readClients(ctx, ask);
		if (!inPlace(c))
			return c.html(await renderClients(ctx, ask, result, c.req.query("new") === "1"), 200, {
				"cache-control": "private, no-store",
			});
		const shown = result.ok ? { ...ask, page: result.page.page } : ask;
		const results = <ClientResults ctx={ctx} ask={shown} result={result} />;
		return patchList({
			c,
			elements:
				asked.paging.via === "filters"
					? [results]
					: [
							<ClientFilters
								key="filters"
								ctx={ctx}
								ask={shown}
								practitioners={await practitionersOf(ctx)}
							/>,
							results,
						],
			regionId: RESULTS_ID,
			url: clientsHref(shown, shown.page, shown.size),
			asked: asked.paging,
		});
	});
	const show = async (c: Context<Env>, tab: ClientTab, flash?: string): Promise<Response> => {
		const ctx = c.var.ctx;
		const id = c.req.param("id") ?? "";
		const can = ctx.can;
		try {
			const client = await ctx.port.client(ctx.app, id);
			if (client === null) throw new PortError("not-found", id);
			// Only what this tab needs, and only what this person may see: one tab failing must not break the others.
			const needs = (...tabs: ClientTab[]): boolean => tabs.includes(tab);
			// What the service cannot keep yet is a tab that says "în curând", not a broken page.
			const soon: Soon[] = [];
			const open = openOf(c, tab);
			const paging = PageParams.parse(c.req.query());
			const size = await sizeOf(ctx, paging);
			await rememberSize(ctx, paging, size as PageSize);
			const ask = { page: pageAsked(paging, size), size };
			let filesShown: Numbered<ClientFile> = { items: [], total: 0, page: 1 };
			const soft = async <T,>(
				what: Soon,
				load: Promise<ReadonlyArray<T>> | never[],
			): Promise<ReadonlyArray<T>> => {
				try {
					return await load;
				} catch (error) {
					if (error instanceof PortError && error.code === "not-available-yet") {
						soon.push(what);
						return [];
					}
					throw error;
				}
			};
			const [
				appointments,
				packages,
				services,
				notes,
				blacklist,
				records,
				fileItems,
				templates,
				invite,
			] = await Promise.all([
				needs("appointments", "packages") && can.has("appointments_view")
					? ctx.port.clientAppointments(ctx.app, id)
					: [],
				needs("overview", "packages") && can.has("packages_view")
					? ctx.port.packages(ctx.app, id)
					: [],
				needs("appointments", "packages") && can.has("services_view")
					? ctx.port.services(ctx.app)
					: [],
				soft(
					"notes",
					needs("overview", "notes") && can.has("notes_view") ? ctx.port.notes(ctx.app, id) : [],
				),
				soft(
					"blacklist",
					can.has("blacklist_view") && needs("overview")
						? ctx.port.blacklistHistory(ctx.app, id)
						: [],
				),
				soft(
					"records",
					needs("records") && can.group("clinical") ? ctx.port.records(ctx.app, id) : [],
				),
				soft(
					"files",
					needs("files") && can.has("files_view")
						? ctx.port.filePage(ctx.app, id, ask).then((page) => {
								filesShown = page;
								return page.items;
							})
						: [],
				),
				needs("records") ? ctx.port.formTemplates(ctx.app) : [],
				// The invitation is shown only to whoever may act on it, and a service that cannot say leaves the card out.
				needs("overview") && ctx.can.has("clients_invite")
					? ctx.port.invite(ctx.app, id).catch((err: unknown) => {
							if (err instanceof PortError) return undefined;
							throw err;
						})
					: undefined,
			]);
			// The file to rename is found by id: it may be on a page of the files not shown yet.
			const renaming =
				open.rename === null
					? null
					: (fileItems.find((f) => f.id === open.rename) ??
						(await ctx.port.files(ctx.app, id)).find((f) => f.id === open.rename) ??
						null);
			const view: ClientView = {
				client,
				tab,
				invite,
				inviteError: inviteErrorFrom(c.req.query("ierr")),
				appointments,
				packages,
				services,
				notes,
				blacklist,
				records,
				paging: ask,
				files: filesShown,
				renaming,
				templates,
				soon,
				open,
				notice: noticeOf(c.req.query("new"), c.req.query("made")),
			};
			// A page of a tab fetched in place: only the tab's body is replaced, and the address follows it.
			if (inPlace(c) && isPagedTab(tab))
				return patchList({
					c,
					elements: [<PagedTabBody key={tab} ctx={ctx} view={view} tab={tab} />],
					regionId: tabRegionId(tab),
					url: tabHref(id, tab, shownPage(ctx, view, tab), ask.size),
					asked: paging,
				});
			return c.html(await renderClient(ctx, view, flash), 200, {
				"cache-control": "private, no-store",
			});
		} catch (err) {
			const o = at(ctx.locale);
			const missing = err instanceof PortError && err.code === "not-found";
			return c.html(
				await Page({
					ctx,
					current: "clients",
					title: m.clients_title({}, o),
					children: (
						<div class="adm-page">
							<p role="alert">{missing ? m.client_not_found({}, o) : m.error_title({}, o)}</p>
							<a class="adm-btn" href="/clients">
								{m.client_back({}, o)}
							</a>
						</div>
					),
				}),
				missing ? 404 : 503,
			);
		}
	};
	app.get("/clients/:id", (c) =>
		show(
			c,
			"overview",
			c.req.query("done") === "archived"
				? m.toast_archived({}, at(c.var.ctx.locale))
				: inviteFlash(c.req.query("done"), c.var.ctx.locale),
		),
	);
	for (const tab of CLIENT_TABS.filter((t) => t !== "overview"))
		app.get(`/clients/:id/${tab}`, (c) => show(c, tab));

	registerClientActions(app);
	registerInviteRoutes(app);
	registerPackageRoutes(app);
}
