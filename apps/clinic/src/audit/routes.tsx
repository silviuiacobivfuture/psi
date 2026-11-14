import type { Hono } from "hono";
import type { Env } from "../app";
import { at } from "../lib/i18n";
import { appendPage, MoreQuery } from "../lib/show-more";
import { sse } from "../lib/sse";
import { OrgFrame } from "../pages/org-settings";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import { auditCsv } from "./csv";
import { DrawerBody } from "./drawer";
import { journalEvent, journalExport, journalPage, peopleOf, windowOf } from "./journal";
import { loadLookup } from "./lookup";
import { AuditCount, AuditMore, AuditRow, renderAuditPage } from "./page";
import { type AuditQuery, AuditQuerySchema } from "./query";
import { describe } from "./rows";

const NO_STORE = { "cache-control": "private, no-store" } as const;

/** The filters from the URL; one that is not a valid value is a refusal (400), never a silently different list. */
function queryOf(raw: Record<string, string>): AuditQuery {
	const parsed = AuditQuerySchema.safeParse(raw);
	if (!parsed.success) throw new PortError("invalid", "the journal's filters");
	return parsed.data;
}

const cursorOf = (raw: string | undefined): string | null =>
	raw === undefined || raw === "" ? null : raw.slice(0, 400);

/** The journal a page at a time, the next page appended, one event's drawer, and the CSV of what the filters show. */
export function registerAudit(app: Hono<Env>): void {
	app.get("/settings/audit", async (c) => {
		const ctx = c.var.ctx;
		const query = queryOf(c.req.query());
		const page = await journalPage(ctx, query, null).catch(() => null);
		return c.html(
			await renderAuditPage(ctx, {
				query,
				page,
				people: page === null ? [] : peopleOf(ctx, page, query.person),
			}),
			200,
			NO_STORE,
		);
	});

	// The next page, with the same filters, appended to the open table: the journal grows a page at a time.
	app.get("/settings/audit/more", async (c) => {
		const ctx = c.var.ctx;
		const query = queryOf(c.req.query());
		const asked = MoreQuery.parse(c.req.query());
		const page = await journalPage(ctx, query, cursorOf(asked.cursor));
		const shown = asked.shown + page.rows.length;
		return appendPage({
			list: "#audit-rows",
			rows: page.rows.map((r) => <AuditRow key={r.row.event.id} ctx={ctx} r={r} />),
			more: <AuditMore ctx={ctx} q={query} cursor={page.nextCursor} shown={shown} />,
			count: <AuditCount ctx={ctx} shown={shown} more={page.nextCursor !== null} />,
		});
	});

	app.get("/settings/audit/export.csv", async (c) => {
		const ctx = c.var.ctx;
		const query = queryOf(c.req.query());
		const found = await journalExport(ctx, query).catch(() => null);
		if (found === null) return c.text("unavailable", 503);
		const body = auditCsv(found.rows, found.lookup, ctx.locale, ctx.can);
		return c.body(body, 200, {
			...NO_STORE,
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": 'attachment; filename="jurnal.csv"',
		});
	});

	app.get("/settings/audit/:id", async (c) => {
		const ctx = c.var.ctx;
		// The days of the read the row came from: checked at the boundary like the journal's own filters.
		const days = queryOf(c.req.query());
		const event = await journalEvent(
			ctx,
			c.req.param("id"),
			cursorOf(c.req.query("c")),
			windowOf(days),
		).catch(() => undefined);
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
			await OrgFrame({
				ctx,
				area: "audit",
				title: m.jr_d_title({}, at(ctx.locale)),
				children: body,
			}),
			200,
			NO_STORE,
		);
	});
}
