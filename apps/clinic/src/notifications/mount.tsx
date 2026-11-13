import { createInboxRoutes, inboxLabels, present } from "@psi/notify/inbox";
import { Inbox, type InboxData } from "@psi/ui";
import { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import type { Ctx } from "../lib/context";
import type { NotificationsPort } from "./port";

/** Where the bell's endpoints are mounted. */
export const INBOX_BASE = "/inbox";

/** The estate's clinics keep Bucharest time; the bell words "today" and the hour in it. */
const CLINIC_ZONE = "Europe/Bucharest";
const INITIAL_MS = 800;

export interface Notifications {
	/** Adds the bell's endpoints behind the console's sign-in. */
	register(app: Hono<Env>): void;
	/** The bell for the top bar, first drawn with what the feed answers in a moment (the live stream fills the rest). */
	bell(ctx: Ctx): Promise<JSX.Element>;
}

/** The bell and its endpoints over a notifications port; the subscriber is the signed-in person's estate subject. */
export function createNotifications(feed: NotificationsPort, origin: string): Notifications {
	const asked = new WeakMap<Request, Ctx>();
	const { app: routes, urls } = createInboxRoutes({
		feed,
		subscriberOf: (c) => asked.get(c.req.raw)?.person.subject,
		localeOf: (c) => asked.get(c.req.raw)?.locale ?? "ro",
		consoleOrigin: origin,
		timeZone: CLINIC_ZONE,
		mount: INBOX_BASE,
	});
	return {
		register(app) {
			const sub = new Hono<Env>();
			sub.use("*", async (c, next) => {
				asked.set(c.req.raw, c.var.ctx);
				await next();
			});
			sub.route("/", routes);
			app.route(INBOX_BASE, sub);
		},
		async bell(ctx) {
			const first = await Promise.race([
				feed.list(ctx.person.subject, 20).then((r): InboxData | null => {
					return present(r.entries, r.unread, {
						locale: ctx.locale,
						timeZone: CLINIC_ZONE,
						consoleOrigin: origin,
						now: Date.now(),
					});
				}),
				new Promise<null>((resolve) => setTimeout(() => resolve(null), INITIAL_MS)),
			]).catch((): InboxData => ({ state: "error" }));
			return (
				<Inbox
					data={first ?? { state: "ready", entries: [], unread: 0 }}
					labels={inboxLabels(ctx.locale)}
					urls={urls}
				/>
			);
		},
	};
}
