import type { Context, Hono } from "hono";
import { z } from "zod";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { Env } from "../app";
import { all, type Body, one } from "../lib/catalog-form";
import { at, type Locale } from "../lib/i18n";
import { signalsOf, sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { InviteOutcomeSchema, SignInLinkSchema } from "../port/schema-members";
import { StaffResults } from "./member-add";
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

/** An invitation refused for what the person can fix (or wait out): the sheet opens again with the reason. */
const INVITE_PROBLEM: Partial<Record<keyof typeof STATUS, string>> = {
	invalid: "invalid",
	conflict: "invite-conflict",
	unavailable: "invite-unavailable",
};

/** A new link refused for what can be told: the editor opens again with the reason. */
const LINK_PROBLEM: Partial<Record<keyof typeof STATUS, string>> = {
	conflict: "link-conflict",
	unavailable: "link-unavailable",
};

/** The words of a `problem=` the page was sent back with. */
function problemText(code: string | undefined, locale: Locale): string | undefined {
	const o = at(locale);
	switch (code) {
		case undefined:
			return undefined;
		case "invite-conflict":
			return m.mb_invite_conflict({}, o);
		case "invite-unavailable":
			return m.mb_invite_unavailable({}, o);
		case "link-conflict":
			return m.mb_link_conflict({}, o);
		case "link-unavailable":
			return m.mb_link_unavailable({}, o);
		default:
			return m.mb_problem({}, o);
	}
}

const SearchSignals = z.object({ nm: z.object({ q: z.string().max(200) }) });

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
		const problem = problemText(q("problem"), c.var.ctx.locale);
		const query = {
			create: q("new") === "1",
			invite: q("invite") === "1",
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
	// As one types in "Adaugă membru": the people of the team's sign-in group, for whoever may add members.
	app.post(`${BASE}/staff`, async (c) => {
		const ctx = c.var.ctx;
		if (!ctx.can.write("members_create")) return c.text("forbidden", 403);
		const s = await signalsOf(c, SearchSignals);
		return sse(async (stream) => {
			const query = s?.nm.q.trim() ?? "";
			let found: Awaited<ReturnType<typeof ctx.port.searchStaff>> = [];
			let failed = false;
			if (query.length >= 2)
				try {
					found = await ctx.port.searchStaff(ctx.app, query);
				} catch {
					failed = true;
				}
			stream.patchElements(
				(
					<StaffResults query={query} found={found} failed={failed} locale={ctx.locale} />
				).toString(),
			);
		});
	});

	// The invitation answers the page itself (no redirect): a new account's one-time link must never be in a URL.
	app.post(`${BASE}/invite`, async (c) => {
		const ctx = c.var.ctx;
		const b = await body(c);
		const result = await runAction(
			actionCtx(ctx),
			"member.invite",
			{
				email: one(b, "email"),
				displayName: one(b, "displayName"),
				roles: all(b, "roles"),
				coordinates: all(b, "coordinates"),
				locale: ctx.locale,
			},
			{ confirmed: true },
		);
		if (result.status === "ok") {
			const outcome = InviteOutcomeSchema.safeParse(result.data);
			if (outcome.success)
				return c.html(
					await renderMembers(
						ctx,
						{ create: false, invite: false, edit: null, confirm: null },
						undefined,
						undefined,
						outcome.data,
					),
					200,
					NOCACHE,
				);
			return c.redirect(BASE, 303);
		}
		if (result.status === "refused" && INVITE_PROBLEM[result.code] !== undefined)
			return c.redirect(`${BASE}?invite=1&problem=${INVITE_PROBLEM[result.code]}`, 303);
		return c.text(
			result.status === "refused" ? result.code : "confirmation",
			result.status === "refused" ? STATUS[result.code] : 400,
		);
	});

	// A new set-password link answers the page itself, as the invitation does: the link is never in a URL.
	app.post(`${BASE}/:subject/link`, async (c) => {
		const ctx = c.var.ctx;
		const subject = c.req.param("subject");
		const result = await runAction(actionCtx(ctx), "member.link", { subject }, { confirmed: true });
		if (result.status === "ok") {
			const made = SignInLinkSchema.safeParse(result.data);
			if (!made.success) return c.redirect(editing(subject), 303);
			const member = (await ctx.port.members(ctx.app)).find((x) => x.subject === subject);
			return c.html(
				await renderMembers(
					ctx,
					{ create: false, invite: false, edit: null, confirm: null },
					undefined,
					undefined,
					undefined,
					{ name: member?.displayName ?? subject, ...made.data },
				),
				200,
				NOCACHE,
			);
		}
		if (result.status === "refused" && LINK_PROBLEM[result.code] !== undefined)
			return c.redirect(`${editing(subject)}&problem=${LINK_PROBLEM[result.code]}`, 303);
		return c.text(
			result.status === "refused" ? result.code : "confirmation",
			result.status === "refused" ? STATUS[result.code] : 400,
		);
	});

	app.post(`${BASE}/:subject/remove`, async (c) =>
		run(c, "member.remove", { subject: c.req.param("subject") }, BASE),
	);
}
