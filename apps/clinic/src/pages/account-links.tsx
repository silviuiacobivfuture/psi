import { Banner, EmptyState, PageHeader } from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { AccountLink } from "../port/schema-links";

const Done = z.enum(["linked", "dismissed"]).optional().catch(undefined);
const Problem = z.enum(["conflict"]).optional().catch(undefined);

/** One account waiting: what matched, the booking that showed it, and the clients it could be. */
function Suggestion({ ctx, link }: { ctx: Ctx; link: AccountLink }): JSX.Element {
	const o = at(ctx.locale);
	const formId = `al-${link.id.slice(0, 12)}`;
	const only = link.candidates.length === 1;
	return (
		<li class="adm-card adm-stack" data-account-link={link.id}>
			<form
				id={formId}
				method="post"
				action={`/account-links/${link.id}/confirm`}
				class="adm-stack"
				data-action="client.linkAccount"
			>
				<fieldset class="adm-stack">
					<legend>
						{link.via === "email" ? m.al_via_email({}, o) : m.al_via_phone({}, o)}
						{link.reference === undefined ? null : (
							<span class="adm-muted"> {m.al_reference({ reference: link.reference }, o)}</span>
						)}
					</legend>
					{link.candidates.map((c) => (
						<label key={c.clientId} class="adm-check">
							<input type="radio" name="clientId" value={c.clientId} checked={only} required />
							<a href={`/clients/${encodeURIComponent(c.clientId)}`}>{c.name}</a>
						</label>
					))}
				</fieldset>
			</form>
			<div class="adm-row">
				<button class="adm-btn adm-btn--primary" type="submit" form={formId}>
					{m.al_confirm({}, o)}
				</button>
				<form
					method="post"
					action={`/account-links/${link.id}/dismiss`}
					data-action="client.dismissAccountLink"
				>
					<button class="adm-btn" type="submit">
						{m.al_dismiss({}, o)}
					</button>
				</form>
			</div>
		</li>
	);
}

/** CONTURI ONLINE DE CONFIRMAT: the accounts the team is asked about, newest first. */
export async function renderAccountLinks(
	ctx: Ctx,
	notice: { done?: "linked" | "dismissed" | undefined; conflict: boolean },
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const links = await ctx.port.accountLinks(ctx.app);
	return Page({
		ctx,
		current: "clients",
		title: m.al_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.al_title({}, o)} />
				<p class="adm-muted">{m.al_lead({}, o)}</p>
				{notice.done === undefined ? null : (
					<Banner tone="info" icon="check">
						{notice.done === "linked" ? m.al_done_linked({}, o) : m.al_done_dismissed({}, o)}
					</Banner>
				)}
				{notice.conflict ? (
					<Banner tone="error" icon="alert">
						{m.al_conflict({}, o)}
					</Banner>
				) : null}
				{links.length === 0 ? (
					<EmptyState icon="users" title={m.al_empty({}, o)} />
				) : (
					<ul class="adm-stack" data-account-links>
						{links.map((link) => (
							<Suggestion key={link.id} ctx={ctx} link={link} />
						))}
					</ul>
				)}
			</div>
		),
	});
}

/** One of the page's answers, through its action; a conflict comes back to the page saying so, nothing changed. */
async function answer(
	c: Context<Env>,
	id: "client.linkAccount" | "client.dismissAccountLink",
): Promise<Response> {
	const form = Object.fromEntries(
		Object.entries(await c.req.parseBody()).filter(([, v]) => typeof v === "string"),
	);
	const result = await runAction(
		actionCtx(c.var.ctx),
		id,
		{ ...form, id: c.req.param("id") },
		{ confirmed: true },
	);
	if (result.status === "ok") return c.redirect(result.to ?? "/account-links", 303);
	if (result.status === "refused" && result.code === "conflict")
		return c.redirect("/account-links?problem=conflict", 303);
	if (result.status === "refused" && result.code === "not-found") return c.notFound();
	return c.text(result.status === "refused" ? result.code : "confirmation", 400);
}

export function registerAccountLinks(app: Hono<Env>): void {
	app.get("/account-links", async (c) =>
		c.html(
			await renderAccountLinks(c.var.ctx, {
				done: Done.parse(c.req.query("done")),
				conflict: Problem.parse(c.req.query("problem")) === "conflict",
			}),
			200,
			{ "cache-control": "private, no-store" },
		),
	);
	app.post("/account-links/:id/confirm", (c) => answer(c, "client.linkAccount"));
	app.post("/account-links/:id/dismiss", (c) => answer(c, "client.dismissAccountLink"));
}
