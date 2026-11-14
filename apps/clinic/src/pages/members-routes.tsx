import type { Context, Hono } from "hono";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { Env } from "../app";
import { all, type Body, one } from "../lib/catalog-form";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { renderMembers } from "./members";

const NOCACHE = { "cache-control": "private, no-store" } as const;
const BASE = "/settings/members";
const STATUS = {
	forbidden: 403,
	"not-found": 404,
	invalid: 422,
	conflict: 409,
	unknown: 404,
	unavailable: 503,
} as const;

const memberFrom = (b: Body): Record<string, unknown> => ({
	displayName: one(b, "displayName"),
	email: one(b, "email"),
	roles: all(b, "roles"),
	coordinates: all(b, "coordinates"),
});

/** The members' screen and its forms: every change goes through the action registry, as the assistant's do. */
export function registerMembers(app: Hono<Env>): void {
	app.get(BASE, async (c) => {
		const q = c.req.query.bind(c.req);
		const o = at(c.var.ctx.locale);
		const flash =
			q("saved") !== undefined
				? m.mb_saved({}, o)
				: q("removed") !== undefined
					? m.mb_removed({}, o)
					: undefined;
		const problem = q("problem") === undefined ? undefined : m.mb_problem({}, o);
		const query = {
			create: q("new") === "1",
			edit: q("edit") ?? null,
			confirm: q("confirm") ?? null,
		};
		return c.html(await renderMembers(c.var.ctx, query, flash, problem), 200, NOCACHE);
	});

	const run = async (c: Context<Env>, id: string, params: unknown, back: string) => {
		const result = await runAction(actionCtx(c.var.ctx), id, params, { confirmed: true });
		if (result.status === "ok") return c.redirect(result.to ?? BASE, 303);
		if (result.status === "refused" && (result.code === "invalid" || result.code === "conflict"))
			return c.redirect(`${back}${back.includes("?") ? "&" : "?"}problem=${result.code}`, 303);
		return c.text(
			result.status === "refused" ? result.code : "confirmation",
			result.status === "refused" ? STATUS[result.code] : 400,
		);
	};
	const editing = (subject: string): string => `${BASE}?edit=${encodeURIComponent(subject)}`;
	const body = (c: Context<Env>): Promise<Body> => c.req.parseBody({ all: true });

	app.post(`${BASE}/save`, async (c) => {
		const b = await body(c);
		return run(
			c,
			"member.new",
			{ subject: one(b, "subject"), input: memberFrom(b) },
			`${BASE}?new=1`,
		);
	});
	app.post(`${BASE}/:subject/save`, async (c) => {
		const subject = c.req.param("subject");
		return run(c, "member.edit", { subject, input: memberFrom(await body(c)) }, editing(subject));
	});
	app.post(`${BASE}/:subject/overrides`, async (c) => {
		const subject = c.req.param("subject");
		const b = await body(c);
		// An untouched "Nu" of the extra permissions sends an empty value: nothing to add.
		const grant = all(b, "grant").filter((g) => g !== "");
		return run(c, "member.overrides", { subject, grant, deny: all(b, "deny") }, editing(subject));
	});
	app.post(`${BASE}/:subject/calendar`, async (c) => {
		const subject = c.req.param("subject");
		return run(
			c,
			"member.calendar",
			{ subject, personId: one(await body(c), "personId") },
			editing(subject),
		);
	});
	app.post(`${BASE}/:subject/remove`, async (c) =>
		run(c, "member.remove", { subject: c.req.param("subject") }, BASE),
	);
}
