import type { Context, Hono } from "hono";
import type { Env } from "../app";
import { Page } from "../chrome";
import { at } from "../lib/i18n";
import { appendPage, MoreQuery } from "../lib/show-more";
import { m } from "../paraglide/messages.js";
import { type ClientFilter, PortError } from "../port/port";
import { ClientFilterSchema } from "../port/schema";
import { CLEARABLE_FIELDS } from "../port/schema-clinical";
import { registerClientActions } from "./client-action-routes";
import {
	CLIENT_TABS,
	type ClientOpen,
	type ClientTab,
	renderClient,
	type Soon,
} from "./client-page";
import { registerClientTabMore } from "./client-tab-more";
import { ClientRow, MoreClients, renderClients, ShownCount } from "./clients-list";
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
	app.get("/clients", async (c) => {
		const f = ClientFilterSchema.catch("current").parse(c.req.query("filter"));
		return c.html(
			await renderClients(
				c.var.ctx,
				f satisfies ClientFilter,
				(c.req.query("q") ?? "").slice(0, 120),
				c.req.query("new") === "1",
			),
			200,
			{ "cache-control": "private, no-store" },
		);
	});

	// The next page of the list, appended to the open page: the list grows a page at a time, never all at once.
	app.get("/clients/more", async (c) => {
		const ctx = c.var.ctx;
		const filter = ClientFilterSchema.catch("current").parse(c.req.query("filter"));
		const q = (c.req.query("q") ?? "").slice(0, 120);
		const asked = MoreQuery.parse(c.req.query());
		const page = await ctx.port.clientPage(
			ctx.app,
			filter,
			q,
			asked.cursor === "" ? null : asked.cursor,
		);
		const by = new Map(page.summaries.map((s) => [s.clientId, s]));
		const shown = asked.shown + page.clients.length;
		return appendPage({
			list: "#client-list",
			rows: page.clients.map((client) => (
				<ClientRow key={client.id} client={client} summary={by.get(client.id)} ctx={ctx} />
			)),
			more: <MoreClients ctx={ctx} filter={filter} q={q} cursor={page.nextCursor} shown={shown} />,
			count: <ShownCount ctx={ctx} shown={shown} more={page.nextCursor !== null} />,
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
			let filesNext: string | null = null;
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
				files,
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
						? ctx.port.filePage(ctx.app, id, null).then((page) => {
								filesNext = page.nextCursor;
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
					: (files.find((f) => f.id === open.rename) ??
						(await ctx.port.files(ctx.app, id)).find((f) => f.id === open.rename) ??
						null);
			return c.html(
				await renderClient(
					ctx,
					{
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
						files,
						filesNext,
						renaming,
						templates,
						soon,
						open,
						notice: noticeOf(c.req.query("new"), c.req.query("made")),
					},
					flash,
				),
				200,
				{ "cache-control": "private, no-store" },
			);
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
	registerClientTabMore(app);
}
