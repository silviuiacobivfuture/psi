import { APP_KEYS, type AppKey } from "@psi/notify";
import {
	createReminderRoutes,
	type ReminderActions,
	type ReminderRoutesOptions,
	type UsedLinks,
} from "@psi/notify/reminders";
import { Hono } from "hono";

const PREFIX = "/v1/public/reminders";

/** The app a reminder token names, read WITHOUT trusting it: it only picks whose routes verify the signature. */
function appOfToken(token: string): AppKey | undefined {
	const body = token.split(".")[0] ?? "";
	try {
		const claims: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
		const app =
			typeof claims === "object" && claims !== null ? Reflect.get(claims, "a") : undefined;
		return APP_KEYS.find((k) => k === app);
	} catch {
		return undefined;
	}
}

export interface MountedReminderOptions {
	secret: string;
	used: UsedLinks;
	actions: ReminderActions;
	notifier: ReminderRoutesOptions["notifier"];
	now?: () => number;
}

/**
 * `/v1/public/reminders/:token/(confirm|cancel|ics)`. One service answers for every app on one host, so the host cannot
 * say which app a link is for: the token does, and the routes of THAT app check its signature, its action and its
 * expiry (a token of another app, or a forged one, is refused there).
 */
export function mountReminderRoutes(options: MountedReminderOptions): Hono {
	const perApp = new Map(
		APP_KEYS.map((app) => [
			app,
			createReminderRoutes({
				secret: options.secret,
				used: options.used,
				actions: options.actions,
				notifier: options.notifier,
				appOf: () => app,
				...(options.now === undefined ? {} : { now: options.now }),
			}),
		]),
	);
	const root = new Hono();
	root.all("/:token/*", (c) => {
		const app = appOfToken(c.req.param("token"));
		const routes = app === undefined ? undefined : perApp.get(app);
		if (routes === undefined) return c.notFound();
		const url = new URL(c.req.url);
		url.pathname = url.pathname.slice(PREFIX.length);
		return routes.fetch(new Request(url, c.req.raw));
	});
	return root;
}
