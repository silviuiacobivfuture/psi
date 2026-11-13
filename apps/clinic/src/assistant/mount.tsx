import {
	createStaffAssistantRoutes,
	createStaffEngine,
	type StaffEngine,
	type StaffPage,
	type StaffPort,
	staffCopy,
} from "@psi/engine/staff";
import { staffViews } from "@psi/ui/staff-assistant";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../app";
import { at, localeFrom } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { createStaffPort } from "./staff-port";

/** The assistant's address inside the console. */
export const ASSISTANT_BASE = "/assistant";

/**
 * The staff assistant's engine, made once. The model and its key come from the environment
 * (`OPENROUTER_API_KEY`, optionally `STAFF_ASSISTANT_MODEL`); without a key the panel opens and
 * says the assistant is not available. Conversation memory is in this process only.
 */
export function createAssistantEngine(
	env: Readonly<Record<string, string | undefined>>,
): StaffEngine {
	const dev = env.CLINIC_FAKE_PORT !== undefined && env.NODE_ENV !== "production";
	return createStaffEngine({
		model: {
			id: env.STAFF_ASSISTANT_MODEL ?? "anthropic/claude-haiku-4.5",
			// Synthetic data only: the development fake may use any provider route.
			dataCollection: dev && env.STAFF_ASSISTANT_DATA_COLLECTION === "allow" ? "allow" : "deny",
		},
		links: {
			client: (id) => `/clients/${encodeURIComponent(id)}`,
			appointment: (_id, date) => `/calendar?date=${date}`,
			request: () => "/requests",
			audit: () => "/audit",
		},
		onFailure: (f) => console.error(`[clinic] assistant ${f.stage}: ${f.error}`),
	});
}

/** The screen the person is on, as ids only, for "this client" and "this room". */
export function pageOf(path: string, date: string | undefined): StaffPage {
	const client = /^\/clients\/([^/]+)/.exec(path)?.[1];
	if (client !== undefined) return { screen: "client", clientId: decodeURIComponent(client) };
	const screen = path.startsWith("/calendar")
		? "calendar"
		: path.startsWith("/clients")
			? "clients"
			: path.startsWith("/requests")
				? "requests"
				: path.startsWith("/roster")
					? "roster"
					: path.startsWith("/reminders")
						? "reminders"
						: path.startsWith("/settings")
							? "settings"
							: "other";
	return { screen, ...(date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date) ? {} : { date }) };
}

/** Mounts the assistant's routes behind the console's sign-in: the person's port is made per request. */
export function mountAssistant(app: Hono<Env>, engine: StaffEngine): void {
	const ports = new WeakMap<Request, StaffPort>();
	const sub = new Hono<Env>();
	sub.use("*", async (c, next) => {
		const ctx = c.var.ctx;
		const roles = ctx.memberships.find((m) => m.app === ctx.app)?.roles ?? [];
		ports.set(
			c.req.raw,
			createStaffPort({
				port: ctx.port,
				app: ctx.app,
				appName:
					ctx.app === "psizone"
						? m.app_psizone({}, at(ctx.locale))
						: m.app_hemisync({}, at(ctx.locale)),
				person: ctx.person,
				roles,
				locale: ctx.locale,
			}),
		);
		await next();
	});
	sub.route(
		"/",
		createStaffAssistantRoutes((c) => ports.get(c.req.raw), engine, {
			views: (c) => staffViews(staffCopy(localeFrom(getCookie(c, "lang"))).panel, ASSISTANT_BASE),
		}),
	);
	app.route(ASSISTANT_BASE, sub);
}
