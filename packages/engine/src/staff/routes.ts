import { randomBytes } from "node:crypto";
import { type Context, Hono } from "hono";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";
import { z } from "zod";
import type { StaffEngine } from "./engine";
import { type StaffEvent, StaffPageSchema } from "./events";
import type { StaffLocaleSchema } from "./model";
import type { StaffPort } from "./port";
import type { StaffViews, ViewPatch } from "./views";

/** The person's own port for this request, or undefined when nobody is signed in. */
export type StaffPortSource = (
	c: Context,
) => StaffPort | undefined | Promise<StaffPort | undefined>;

export interface StaffRouteOptions {
	/** How the page draws a turn: `@psi/ui/staff-assistant`'s views. */
	views: StaffViews | ((c: Context) => StaffViews);
	/** The language of a confirmation when nobody is signed in. Defaults to Romanian. */
	fallbackLocale?: z.infer<typeof StaffLocaleSchema>;
}

const SignalsSchema = z
	.object({
		staff: z
			.object({
				message: z.string(),
				threadId: z.string().optional(),
				page: StaffPageSchema.optional(),
			})
			.passthrough(),
	})
	.passthrough();

const ProposalQuerySchema = z.string().regex(/^prop_[0-9a-f]{32}$/);

function flat(html: string): string {
	return html.replace(/\n/g, " ");
}

async function write(stream: SSEStreamingApi, patch: ViewPatch): Promise<void> {
	const head =
		patch.selector === undefined
			? ""
			: `selector ${patch.selector}\nmode ${patch.mode ?? "outer"}\n`;
	await stream.writeSSE({
		event: "datastar-patch-elements",
		data: `${head}elements ${flat(patch.html)}`,
	});
}

/**
 * A request must come from the page's own Datastar: a cross-site form cannot set this header, and
 * a browser that reports the site as foreign is refused.
 */
function fromOurPage(c: Context): boolean {
	return (
		c.req.header("datastar-request") === "true" && c.req.header("sec-fetch-site") !== "cross-site"
	);
}

/**
 * The assistant's routes for the console to mount behind its single sign-on guard:
 * `POST /chat` streams a turn, `POST /confirm?proposal=` executes a confirmed change,
 * `POST /dismiss?proposal=` drops one. The port comes per request, built with the signed-in
 * person's own token, so nothing here can exceed that person's permissions.
 */
export function createStaffAssistantRoutes(
	portFor: StaffPortSource,
	engine: StaffEngine,
	options: StaffRouteOptions,
): Hono {
	const viewsFor = (c: Context): StaffViews =>
		typeof options.views === "function" ? options.views(c) : options.views;
	const app = new Hono();

	app.post("/chat", async (c) => {
		if (!fromOurPage(c)) return c.json({ error: "forbidden" }, 403);
		const views = viewsFor(c);
		const body: unknown = await c.req.json().catch(() => undefined);
		const signals = SignalsSchema.safeParse(body);
		const port = await portFor(c);
		const id = `x${randomBytes(6).toString("hex")}`;
		return streamSSE(c, async (stream) => {
			const abort = new AbortController();
			stream.onAbort(() => abort.abort());
			const message = signals.success ? signals.data.staff.message : "";
			const signal = (staff: Record<string, unknown>): Promise<void> =>
				stream.writeSSE({
					event: "datastar-patch-signals",
					data: `signals ${JSON.stringify({ staff })}`,
				});
			const events: AsyncIterable<StaffEvent> =
				port === undefined
					? refused("no_principal")
					: engine.chat(
							port,
							signals.success
								? {
										message,
										...(signals.data.staff.threadId
											? { threadId: signals.data.staff.threadId }
											: {}),
										...(signals.data.staff.page === undefined
											? {}
											: { page: signals.data.staff.page }),
									}
								: {},
							{ signal: abort.signal },
						);
			let text = "";
			const iterator = events[Symbol.asyncIterator]();
			const first = await iterator.next();
			// A double press: the first message is already being answered, and this one draws nothing.
			if (!first.done && first.value.type === "refusal" && first.value.reason === "duplicate")
				return;
			await write(stream, views.exchange({ id, message }));
			// The page's buttons stay off until this turn ends, whatever way it ends.
			await signal({ message: "", busy: true });
			const all = (async function* (): AsyncGenerator<StaffEvent, void, undefined> {
				if (!first.done) yield first.value;
				for (let next = await iterator.next(); !next.done; next = await iterator.next())
					yield next.value;
			})();
			try {
				await drain(all);
			} finally {
				await signal({ busy: false }).catch(() => undefined);
			}

			async function drain(source: AsyncIterable<StaffEvent>): Promise<void> {
				for await (const event of source) {
					if (abort.signal.aborted) return;
					switch (event.type) {
						case "thinking":
							break;
						case "tool":
							await write(
								stream,
								views.chip({
									id,
									callId: event.callId,
									label: event.label,
									phase: event.phase,
								}),
							);
							break;
						case "text":
							text += event.delta;
							await write(stream, views.text({ id, text }));
							break;
						case "replace":
							text = event.text;
							await write(stream, views.text({ id, text }));
							break;
						case "card":
							await write(stream, views.card({ id, card: event.card }));
							break;
						case "refusal":
							await write(stream, views.refusal({ id, reason: event.reason }));
							break;
						case "done":
							await write(stream, views.done({ id }));
							break;
						default: {
							const never: never = event;
							return never;
						}
					}
				}
			}
		});
	});

	app.get("/briefing", async (c) => {
		if (!fromOurPage(c)) return c.json({ error: "forbidden" }, 403);
		const views = viewsFor(c);
		const port = await portFor(c);
		return streamSSE(c, async (stream) => {
			const card = await engine.briefing(port);
			if (card !== undefined) await write(stream, views.briefing({ card }));
		});
	});

	app.post("/confirm", async (c) => {
		if (!fromOurPage(c)) return c.json({ error: "forbidden" }, 403);
		const views = viewsFor(c);
		const proposal = ProposalQuerySchema.safeParse(c.req.query("proposal"));
		if (!proposal.success) return c.json({ error: "invalid" }, 400);
		const port = await portFor(c);
		return streamSSE(c, async (stream) => {
			const outcome = await engine.confirm(port, proposal.data, options.fallbackLocale);
			await write(stream, views.result({ outcome }));
		});
	});

	app.post("/dismiss", async (c) => {
		if (!fromOurPage(c)) return c.json({ error: "forbidden" }, 403);
		const views = viewsFor(c);
		const proposal = ProposalQuerySchema.safeParse(c.req.query("proposal"));
		if (!proposal.success) return c.json({ error: "invalid" }, 400);
		const port = await portFor(c);
		const done = port === undefined ? false : await engine.dismiss(port, proposal.data);
		return streamSSE(c, async (stream) => {
			if (done) await write(stream, views.dismissed({ proposalId: proposal.data }));
		});
	});

	return app;
}

async function* refused(reason: "no_principal"): AsyncGenerator<StaffEvent, void, undefined> {
	yield { type: "refusal", reason };
	yield { type: "done" };
}
