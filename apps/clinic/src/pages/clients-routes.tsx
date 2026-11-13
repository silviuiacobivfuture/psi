import type { Hono } from "hono";
import type { Env } from "../app";
import { Page } from "../chrome";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { type ClientFilter, PortError } from "../port/port";
import { ClientFilterSchema } from "../port/schema";
import { CLIENT_TABS, type ClientTab, renderClient } from "./client-page";
import { renderClients } from "./clients-list";
import { registerPackageRoutes } from "./package-routes";

function noticeOf(
	invalid: string | undefined,
	made: string | undefined,
): "invalid" | "made" | null {
	return invalid === "invalid" ? "invalid" : made === undefined ? null : "made";
}

export function registerClients(app: Hono<Env>): void {
	app.get("/clients", async (c) => {
		const f = ClientFilterSchema.catch("current").parse(c.req.query("filter"));
		return c.html(
			await renderClients(
				c.var.ctx,
				f satisfies ClientFilter,
				(c.req.query("q") ?? "").slice(0, 120),
			),
			200,
			{ "cache-control": "private, no-store" },
		);
	});

	const show = async (
		c: import("hono").Context<Env>,
		tab: ClientTab,
		flash?: string,
	): Promise<Response> => {
		const ctx = c.var.ctx;
		const id = c.req.param("id") ?? "";
		try {
			const client = await ctx.port.client(ctx.app, id);
			if (client === null) throw new PortError("not-found", id);
			// Only what this person may see is asked for: a tab they cannot open must not break the ones they can.
			const [appointments, packages, services] = await Promise.all([
				ctx.can.has("appointments_view") ? ctx.port.clientAppointments(ctx.app, id) : [],
				ctx.can.has("packages_view") ? ctx.port.packages(ctx.app, id) : [],
				ctx.can.has("services_view") ? ctx.port.services(ctx.app) : [],
			]);
			return c.html(
				await renderClient(
					ctx,
					{
						client,
						tab,
						appointments,
						packages,
						services,
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
			c.req.query("done") === "archived" ? m.toast_archived({}, at(c.var.ctx.locale)) : undefined,
		),
	);
	for (const tab of CLIENT_TABS.filter((t) => t !== "overview"))
		app.get(`/clients/:id/${tab}`, (c) => show(c, tab));

	// Archive hides; Delete erases. Each is ONE confirmation (the sheet) and ONE write.
	app.post("/clients/:id/archive", async (c) => {
		const ctx = c.var.ctx;
		try {
			await ctx.port.archiveClient(ctx.app, c.req.param("id"));
		} catch (err) {
			if (err instanceof PortError && err.code === "not-found") return c.notFound();
			throw err;
		}
		return c.redirect(`/clients/${c.req.param("id")}?done=archived`, 303);
	});
	app.post("/clients/:id/delete", async (c) => {
		const ctx = c.var.ctx;
		try {
			await ctx.port.deleteClient(ctx.app, c.req.param("id"));
		} catch (err) {
			if (err instanceof PortError && err.code === "not-found") return c.notFound();
			throw err;
		}
		return c.redirect("/clients?deleted=1", 303);
	});
	registerPackageRoutes(app);
}
