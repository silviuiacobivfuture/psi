import type { Hono } from "hono";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import type { AuditEvent } from "../port/schema";
import { auditCsv } from "./csv";
import { DrawerBody } from "./drawer";
import { actorName, loadLookup } from "./lookup";
import { type AuditView, renderAuditPage, select } from "./page";
import { type AuditQuery, AuditQuerySchema } from "./query";
import { describe } from "./rows";

const NO_STORE = { "cache-control": "private, no-store" } as const;

/** The filters from the URL; one that is not a valid value is a refusal (400), never a silently different list. */
function queryOf(raw: Record<string, string>): AuditQuery {
	const parsed = AuditQuerySchema.safeParse(raw);
	if (!parsed.success) throw new PortError("invalid", "the journal's filters");
	return parsed.data;
}

async function eventsOf(ctx: Ctx): Promise<ReadonlyArray<AuditEvent> | null> {
	try {
		return await ctx.port.audit(ctx.app);
	} catch {
		return null;
	}
}

/** The journal, one event's drawer, and the CSV of what the filters show. */
export function registerAudit(app: Hono<Env>): void {
	app.get("/audit", async (c) => {
		const ctx = c.var.ctx;
		const query = queryOf(c.req.query());
		const events = await eventsOf(ctx);
		let view: AuditView = { events, query, shown: null, people: [] };
		if (events !== null) {
			const { rows, lookup } = await select(ctx, events, query);
			const actors = [...new Set(events.map((e) => e.actor))];
			const people = actors
				.map((value) => ({ value, label: actorName(lookup, value) }))
				.sort((a, b) => a.label.localeCompare(b.label, ctx.locale));
			view = { events, query, shown: rows, people };
		}
		return c.html(await renderAuditPage(ctx, view), 200, NO_STORE);
	});

	app.get("/audit/export.csv", async (c) => {
		const ctx = c.var.ctx;
		const query = queryOf(c.req.query());
		const events = await eventsOf(ctx);
		if (events === null) return c.text("unavailable", 503);
		const { all, lookup } = await select(ctx, events, query);
		const body = auditCsv(all, lookup, ctx.locale, ctx.can);
		return c.body(body, 200, {
			...NO_STORE,
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": 'attachment; filename="jurnal.csv"',
		});
	});

	app.get("/audit/:id", async (c) => {
		const ctx = c.var.ctx;
		const events = await eventsOf(ctx);
		const event = events?.find((e) => e.id === c.req.param("id"));
		if (event === undefined) return c.text("not-found", 404);
		const lookup = await loadLookup(ctx, [event]);
		const body = (
			<DrawerBody ctx={ctx} row={describe(event, lookup, ctx.locale, ctx.can)} lookup={lookup} />
		);
		if (c.req.header("datastar-request") === "true")
			return sse((stream) => {
				stream.patchElements(body.toString());
			});
		return c.html(
			await Page({
				ctx,
				current: "audit",
				title: m.jr_d_title({}, at(ctx.locale)),
				children: <div class="adm-page">{body}</div>,
			}),
			200,
			NO_STORE,
		);
	});
}
