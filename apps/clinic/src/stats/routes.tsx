import type { Hono } from "hono";
import type { Env } from "../app";
import { clamp, previousOf, StatsQuerySchema, spanOf } from "../domain/periods";
import { todayIso } from "../lib/dates";
import { PortError } from "../port/port";
import type { Report, ReportQuery } from "../port/report-schema";
import { renderStats } from "./page";

/** The statistics screen: the period and person from the URL, the figures from the port, the error state when it refuses. */
export function registerStats(app: Hono<Env>): void {
	app.get("/stats", async (c) => {
		const ctx = c.var.ctx;
		const parsed = StatsQuerySchema.safeParse(c.req.query());
		if (!parsed.success) throw new PortError("invalid", "the statistics' period");
		const query = parsed.data;
		const span = clamp(spanOf(query, todayIso()));
		const compare = query.compare === "1" ? previousOf(span) : null;
		const people = (await ctx.port.columns(ctx.app).catch(() => []))
			.filter((col) => col.kind === "person")
			.map((col) => ({ id: col.id, name: col.name }));
		if (query.person !== undefined && !people.some((p) => p.id === query.person))
			throw new PortError("not-found", "that person");
		const ask: ReportQuery = {
			from: span.from,
			to: span.to,
			...(compare === null ? {} : { compare }),
			...(query.person === undefined ? {} : { personId: query.person }),
		};
		let report: Report | null = null;
		try {
			report = await ctx.port.report(ctx.app, ask);
		} catch (error) {
			// Only the kinds of refusal that have a screen of their own end here; the rest are the service's to answer for.
			if (!(error instanceof PortError) || error.code !== "unavailable") throw error;
		}
		return c.html(await renderStats(ctx, { query, span, compare, people, report }), 200, {
			"cache-control": "private, no-store",
		});
	});
}
