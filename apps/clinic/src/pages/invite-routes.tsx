import type { Hono } from "hono";
import type { Env } from "../app";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import { type InvitePick, InvitePickSchema } from "../port/schema";
import { renderInvitePage } from "./invite-page";

const STATUS_OF: Readonly<Record<string, 400 | 403 | 404 | 409 | 503>> = {
	invalid: 400,
	forbidden: 403,
	"not-found": 404,
	conflict: 409,
};

/**
 * The invitation of a client to the online account. Every step is a plain form post: pick (who, which language), read the
 * e-mail as it would go, send. A refusal puts the person back on the page with the reason in their words and nothing
 * changed; resending and withdrawing are one tap and one write each.
 */
export function registerInviteRoutes(app: Hono<Env>): void {
	const pickOf = (raw: Record<string, unknown>, fallback: InvitePick): InvitePick => {
		const parsed = InvitePickSchema.safeParse({
			contact: raw.contact ?? fallback.contact,
			locale: raw.locale ?? fallback.locale,
		});
		return parsed.success ? parsed.data : fallback;
	};

	async function page(
		c: import("hono").Context<Env>,
		step: "pick" | "preview" | "send",
	): Promise<Response> {
		const ctx = c.var.ctx;
		const id = c.req.param("id") ?? "";
		const client = await ctx.port.client(ctx.app, id);
		if (client === null) return c.notFound();
		const first: InvitePick = {
			contact: ctx.can.group("contact") ? "client" : "guardian",
			locale: "ro",
		};
		const pick = pickOf(step === "pick" ? {} : await c.req.parseBody(), first);
		let preview = null;
		let error: PortError | null = null;
		try {
			if (step === "preview") preview = await ctx.port.previewInvite(ctx.app, id, pick);
			if (step === "send") {
				await ctx.port.sendInvite(ctx.app, id, pick);
				return c.redirect(`/clients/${id}?done=invited`, 303);
			}
		} catch (err) {
			if (!(err instanceof PortError)) throw err;
			if (err.code === "not-found") return c.notFound();
			error = err;
		}
		const status = error === null ? 200 : (STATUS_OF[error.code] ?? 503);
		return c.html(await renderInvitePage(ctx, { client, pick, preview, error }), status, {
			"cache-control": "private, no-store",
		});
	}

	app.get("/clients/:id/invite", (c) => page(c, "pick"));
	app.post("/clients/:id/invite/preview", (c) => page(c, "preview"));
	app.post("/clients/:id/invite/send", (c) => page(c, "send"));

	for (const [action, done] of [
		["resend", "resent"],
		["revoke", "revoked"],
	] as const) {
		app.post(`/clients/:id/invite/${action}`, async (c) => {
			const ctx = c.var.ctx;
			const id = c.req.param("id") ?? "";
			try {
				if (action === "resend") await ctx.port.resendInvite(ctx.app, id);
				else await ctx.port.revokeInvite(ctx.app, id);
			} catch (err) {
				if (!(err instanceof PortError)) throw err;
				if (err.code === "not-found") return c.notFound();
				const why = encodeURIComponent(`${err.code}:${err.reason ?? ""}`);
				return c.redirect(`/clients/${id}?ierr=${why}`, 303);
			}
			return c.redirect(`/clients/${id}?done=${done}`, 303);
		});
	}
}

/** The flash of a finished step, in the person's language. */
export function inviteFlash(done: string | undefined, locale: "ro" | "en"): string | undefined {
	const o = at(locale);
	switch (done) {
		case "invited":
			return m.toast_invited({}, o);
		case "resent":
			return m.toast_resent({}, o);
		case "revoked":
			return m.toast_revoked({}, o);
		default:
			return undefined;
	}
}

const CODES = ["forbidden", "unavailable", "conflict", "invalid"] as const;

/** A refusal carried back to the client page in the address (`ierr=conflict:too_soon`), as the error it was. */
export function inviteErrorFrom(raw: string | undefined): PortError | null {
	if (raw === undefined) return null;
	const [code, reason] = raw.split(":");
	const known = CODES.find((c) => c === code);
	if (known === undefined) return new PortError("unavailable", "invite");
	return new PortError(known, "invite", [], reason === "" ? undefined : reason);
}
