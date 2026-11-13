import { toastElement } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { Env } from "../app";
import { Page } from "../chrome";
import { ledger, sessionsLeft } from "../domain/ledger";
import { parseMoney } from "../domain/money";
import { at } from "../lib/i18n";
import { signalsOf, sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { type ClientFilter, PortError } from "../port/port";
import { ClientFilterSchema } from "../port/schema";
import { CLIENT_TABS, type ClientTab, renderClient } from "./client-page";
import { renderClients } from "./clients-list";
import { PackageSignalsSchema, PackageSummary } from "./packages-view";

async function html(el: { toString(): string | Promise<string> }): Promise<string> {
	return await el.toString();
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
				await renderClient(ctx, { client, tab, appointments, packages, services }, flash),
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

	const readPackage = async (c: import("hono").Context<Env>) => {
		// A package is only ever reached through the client who owns it.
		const own = await c.var.ctx.port.packages(c.var.ctx.app, c.req.param("id") ?? "");
		if (!own.some((p) => p.id === c.req.param("pid"))) return "not-found" as const;
		const sig = await signalsOf(c, PackageSignalsSchema);
		const row = sig?.pk[c.req.param("pid") ?? ""];
		if (row === undefined) return null;
		const total = parseMoney(row.total);
		const paid = parseMoney(row.paid);
		return { row, total, paid };
	};
	app.post("/clients/:id/packages/:pid/calc", async (c) => {
		const ctx = c.var.ctx;
		const got = await readPackage(c);
		if (got === "not-found") return c.notFound();
		const pid = c.req.param("pid");
		return sse(async (stream) => {
			if (got === null || got.total === null || got.paid === null) return;
			stream.patchElements(
				await html(
					<PackageSummary
						id={pid}
						totalBani={got.total}
						paidBani={got.paid}
						left={sessionsLeft(got.row.sessions, got.row.bonus, got.row.used)}
						locale={ctx.locale}
					/>,
				),
			);
		});
	});
	app.post("/clients/:id/packages/:pid/save", async (c) => {
		const ctx = c.var.ctx;
		const o = at(ctx.locale);
		const got = await readPackage(c);
		if (got === "not-found") return c.notFound();
		const id = c.req.param("id");
		const pid = c.req.param("pid");
		return sse(async (stream) => {
			if (got === null || got.total === null || got.paid === null) {
				stream.patchElements(toastElement(m.pkg_invalid_amount({}, o), m.dismiss({}, o)));
				return;
			}
			const saved = await ctx.port.savePackage(ctx.app, {
				id: pid,
				clientId: id,
				name: got.row.name,
				sessions: got.row.sessions,
				bonus: got.row.bonus,
				used: got.row.used,
				totalBani: got.total,
				paidBani: got.paid,
				note: got.row.note,
			});
			const l = ledger(saved.totalBani, saved.paidBani);
			stream.patchElements(
				await html(
					<PackageSummary
						id={pid}
						totalBani={l.totalBani}
						paidBani={l.paidBani}
						left={sessionsLeft(saved.sessions, saved.bonus, saved.used)}
						locale={ctx.locale}
					/>,
				),
			);
			stream.patchElements(toastElement(m.pkg_saved({}, o), m.dismiss({}, o)));
		});
	});
}
