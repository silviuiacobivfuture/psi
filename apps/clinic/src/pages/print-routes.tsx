import type { Hono } from "hono";
import type { Env } from "../app";
import { PortError } from "../port/port";
import { PrintPage, PrintQuerySchema, printRange } from "./print";

/** The print page: a plain document built from the same calendar data, opened in its own tab. */
export function registerPrint(app: Hono<Env>): void {
	app.get("/calendar/print", async (c) => {
		const ctx = c.var.ctx;
		const q = PrintQuerySchema.parse(c.req.query());
		const { from, to } = printRange(q);
		try {
			const data = await ctx.port.calendar(ctx.app, from, to);
			const page = await (<PrintPage ctx={ctx} q={q} data={data} />).toString();
			const auto = c.req.query("auto") === "1";
			return c.html(
				auto
					? page.replace(
							"</body>",
							`<script>addEventListener("load",()=>setTimeout(()=>print(),400))</script></body>`,
						)
					: page,
				200,
				{ "cache-control": "private, no-store" },
			);
		} catch (err) {
			if (err instanceof PortError) return c.text("unavailable", 503);
			throw err;
		}
	});
}
