import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/web";
import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app";
import type { LiveSignal } from "../port/port";
import { IsoDateSchema } from "../port/schema";
import { CalendarQuerySchema, renderCalendarLive } from "./calendar";
import { renderRequestsLive } from "./requests";

const LiveQuery = z.discriminatedUnion("screen", [
	z
		.object({ screen: z.literal("calendar") })
		.merge(CalendarQuerySchema.pick({ view: true, col: true }))
		.extend({ date: IsoDateSchema.catch("") }),
	z.object({ screen: z.literal("requests"), show: z.enum(["open", "handled"]).catch("open") }),
]);

const badge = (n: number): string =>
	`<span id="adm-badge-requests" class="adm-badge"${n === 0 ? ' style="display:none"' : ""}>${n}</span>`;

/**
 * The live feed of one open screen. The browser opens it (Datastar `data-init`), the console opens the service's
 * streams with the PERSON's token and, whenever one says something changed, sends the screen's new markup as a Datastar
 * patch: the grid, the list and the tab badge update without a reload. It ends when the browser leaves.
 */
export function registerLive(app: Hono<Env>): void {
	app.get("/live", (c) => {
		const ctx = c.var.ctx;
		const parsed = LiveQuery.safeParse(c.req.query());
		if (!parsed.success) return c.text("invalid", 400);
		const query = parsed.data;
		const stop = new AbortController();
		const request = c.req.raw.signal;
		request.addEventListener("abort", () => stop.abort());
		const patch = async (stream: ServerSentEventGenerator, signal: LiveSignal): Promise<void> => {
			if (
				signal.stream === "inbox" &&
				signal.counts !== undefined &&
				ctx.can.has("requests_view")
			) {
				stream.patchElements(badge(signal.counts.requests));
			} else if (signal.stream === "calendar" && query.screen === "calendar") {
				stream.patchElements(
					await (await renderCalendarLive(ctx, { ...query, new: undefined })).toString(),
				);
			} else if (signal.stream === "requests" && query.screen === "requests") {
				stream.patchElements(await (await renderRequestsLive(ctx, query.show)).toString());
			}
		};
		return ServerSentEventGenerator.stream(
			async (stream) => {
				try {
					for await (const signal of ctx.port.live(ctx.app, stop.signal))
						await patch(stream, signal);
				} catch {
					// The service said no to a stream (sign-in gone, no access, not built): the screen stays as it is.
				}
			},
			{ onAbort: () => stop.abort() },
		);
	});
}
