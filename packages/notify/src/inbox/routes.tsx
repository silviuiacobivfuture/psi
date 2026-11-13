import { type InboxData, type InboxLabels, type InboxUrls, inboxPatch } from "@psi/ui";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import * as m from "../paraglide/messages.js";
import type { Feed } from "./feed";
import { present } from "./present";

export function inboxLabels(locale: "ro" | "en"): InboxLabels {
	const o = { locale } as const;
	return {
		title: m.inbox_title({}, o),
		bell: (n) => (n === 0 ? m.inbox_bell_none({}, o) : m.inbox_bell({ n: String(n) }, o)),
		empty: m.inbox_empty({}, o),
		error: m.inbox_error({}, o),
		retry: m.inbox_retry({}, o),
		markAll: m.inbox_mark_all({}, o),
		markOne: m.inbox_mark_one({}, o),
		groupToday: m.inbox_group_today({}, o),
		groupEarlier: m.inbox_group_earlier({}, o),
		unread: m.inbox_unread({}, o),
	};
}

export interface InboxRoutesOptions {
	feed: Feed;
	/** The signed-in person's Novu subscriber id (their estate subject), or undefined when signed out. */
	subscriberOf: (c: Context) => string | undefined;
	localeOf: (c: Context) => "ro" | "en";
	consoleOrigin: string;
	timeZone: string;
	/** The path these routes are mounted at, e.g. `/inbox`. */
	mount: string;
	pollMs?: number;
	limit?: number;
	now?: () => number;
}

/** A write from this very site (Sec-Fetch-Site, else Origin): a form on another site cannot mark anything read. */
function sameOrigin(c: Context): boolean {
	const site = c.req.header("sec-fetch-site");
	if (site !== undefined) return site === "same-origin";
	const origin = c.req.header("origin");
	if (origin === undefined) return true;
	try {
		return new URL(origin).host === c.req.header("host");
	} catch {
		return false;
	}
}

/**
 * The console's inbox endpoints: `GET /panel`, `GET /stream` (live, SSE), `POST /read?id=`,
 * `POST /read-all`. Each answers Datastar patches of `#psi-inbox`. The stream polls Novu's inbox on
 * the server and writes only when something changed, so the badge moves without the browser ever
 * talking to Novu.
 */
export function createInboxRoutes(o: InboxRoutesOptions): { app: Hono; urls: InboxUrls } {
	const app = new Hono();
	const now = o.now ?? Date.now;
	const urls: InboxUrls = {
		panel: `${o.mount}/panel`,
		stream: `${o.mount}/stream`,
		read: `${o.mount}/read`,
		readAll: `${o.mount}/read-all`,
	};

	async function load(
		c: Context,
		subscriber: string,
	): Promise<{ data: InboxData; signature: string }> {
		try {
			const { entries, unread } = await o.feed.list(subscriber, o.limit ?? 20);
			const data = present(entries, unread, {
				locale: o.localeOf(c),
				timeZone: o.timeZone,
				consoleOrigin: o.consoleOrigin,
				now: now(),
			});
			return {
				data,
				signature: `${unread}|${entries.map((e) => `${e.id}${e.isRead ? "r" : "u"}`).join(",")}`,
			};
		} catch {
			return { data: { state: "error" }, signature: "error" };
		}
	}

	const patch = (c: Context, data: InboxData): { event: string; data: string } => ({
		event: "datastar-patch-elements",
		data: `elements ${inboxPatch({ data, labels: inboxLabels(o.localeOf(c)), urls })}`,
	});

	const guard = (c: Context): string | Response => {
		const subscriber = o.subscriberOf(c);
		return subscriber === undefined ? c.body(null, 401) : subscriber;
	};

	app.get("/panel", (c) => {
		const subscriber = guard(c);
		if (typeof subscriber !== "string") return subscriber;
		return streamSSE(c, async (stream) => {
			await stream.writeSSE(patch(c, (await load(c, subscriber)).data));
		});
	});

	app.get("/stream", (c) => {
		const subscriber = guard(c);
		if (typeof subscriber !== "string") return subscriber;
		return streamSSE(c, async (stream) => {
			let open = true;
			stream.onAbort(() => {
				open = false;
			});
			let last = "";
			while (open) {
				const { data, signature } = await load(c, subscriber);
				if (signature !== last) {
					last = signature;
					await stream.writeSSE(patch(c, data));
				} else {
					await stream.write(": keep-alive\n\n");
				}
				await stream.sleep(o.pollMs ?? 10_000);
			}
		});
	});

	const write =
		(run: (subscriber: string, c: Context) => Promise<void>) =>
		async (c: Context): Promise<Response> => {
			const subscriber = guard(c);
			if (typeof subscriber !== "string") return subscriber;
			if (!sameOrigin(c)) return c.body(null, 403);
			try {
				await run(subscriber, c);
			} catch {
				return streamSSE(c, async (stream) => {
					await stream.writeSSE(patch(c, { state: "error" }));
				});
			}
			return streamSSE(c, async (stream) => {
				await stream.writeSSE(patch(c, (await load(c, subscriber)).data));
			});
		};

	app.post(
		"/read",
		write(async (subscriber, c) => {
			const id = c.req.query("id");
			if (id === undefined || id === "" || id.length > 200) throw new Error("no id");
			await o.feed.markRead(subscriber, id);
		}),
	);
	app.post(
		"/read-all",
		write(async (subscriber) => {
			await o.feed.markAllRead(subscriber);
		}),
	);

	return { app, urls };
}
